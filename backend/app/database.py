import math
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env", override=False)

DEFAULT_SQLITE_URL = "sqlite:///./drainpulse.db"
DEFAULT_POSTGRES_URL = "postgresql+psycopg://drainpulse:drainpulse@localhost:5432/drainpulse"


def build_postgres_url_from_env() -> str:
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    dbname = os.getenv("POSTGRES_DB", "drainpulse")
    user = os.getenv("POSTGRES_USER", "drainpulse")
    password = os.getenv("POSTGRES_PASSWORD", "drainpulse")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"


def get_database_url() -> str:
    configured = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if configured:
        return configured
    if os.getenv("POSTGRES_HOST") or os.getenv("POSTGRES_DB"):
        return build_postgres_url_from_env()
    return DEFAULT_SQLITE_URL


def is_postgres_enabled() -> bool:
    url = get_database_url().lower()
    return url.startswith("postgresql") or url.startswith("postgres")


def get_database_label() -> str:
    return "postgres" if is_postgres_enabled() else "sqlite"


def build_engine(database_url: str | None = None):
    url = (database_url or get_database_url()).strip()
    if url.startswith(("postgresql", "postgres")):
        try:
            import psycopg  # noqa: F401
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise RuntimeError(
                "PostgreSQL support requires psycopg to be installed. "
                "Install with: pip install psycopg[binary]"
            ) from exc
        return create_engine(url, pool_pre_ping=True)
    return create_engine(url, connect_args={"check_same_thread": False})


SQLALCHEMY_DATABASE_URL = get_database_url()
engine = build_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_compatibility() -> None:
    """Backfill older SQLite schema versions created before tenant-aware models were added."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if not tables:
        return

    from app.models import DrainAsset, IncidentReport, MaintenanceTask, RainfallScenario, StoredFile, User

    models = [User, DrainAsset, IncidentReport, MaintenanceTask, RainfallScenario, StoredFile]

    for model in models:
        table_name = model.__tablename__
        if table_name not in tables:
            continue

        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        missing_columns = [
            column for column in model.__table__.columns if column.name not in existing_columns
        ]

        with SessionLocal() as db:
            if missing_columns:
                for column in missing_columns:
                    column_sql = column.type.compile(dialect=engine.dialect)
                    try:
                        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column_sql}"))
                    except Exception:  # pragma: no cover - SQLite guard against duplicate adds
                        pass
            if "tenant_id" in {column.name for column in model.__table__.columns}:
                db.execute(
                    text(f"UPDATE {table_name} SET tenant_id = 'default' WHERE tenant_id IS NULL OR tenant_id = ''")
                )
            db.commit()


def initialize_postgres_extensions() -> None:
    if not is_postgres_enabled():
        return
    with SessionLocal() as db:
        try:
            db.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            db.execute(text("SELECT postgis_version();"))
            db.commit()
        except Exception:
            # Graceful fallback in environments without a live Postgres/PostGIS instance.
            db.rollback()


def ensure_postgis_columns() -> None:
    if not is_postgres_enabled():
        return
    with SessionLocal() as db:
        try:
            db.execute(
                text(
                    """
                    ALTER TABLE drain_assets
                    ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
                    """
                )
            )
            db.execute(
                text(
                    """
                    UPDATE drain_assets
                    SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
                    WHERE geom IS NULL AND lat IS NOT NULL AND lon IS NOT NULL;
                    """
                )
            )
            db.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_drain_assets_geom
                    ON drain_assets USING GIST (geom);
                    """
                )
            )
            db.commit()
        except Exception:
            db.rollback()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius_km * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearby_assets(db: Session, lat: float, lon: float, radius_km: float = 5.0, limit: int = 10):
    from app.models import DrainAsset

    radius_km = max(float(radius_km), 0.1)

    if is_postgres_enabled():
        try:
            columns = db.execute(
                text(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'drain_assets' AND column_name = 'geom'
                    """
                )
            ).fetchall()
            if not columns:
                ensure_postgis_columns()
            rows = db.execute(
                text(
                    """
                    SELECT *
                    FROM drain_assets
                    WHERE ST_DWithin(
                        geom,
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                        :radius_meters
                    )
                    ORDER BY ST_Distance(
                        geom,
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                    )
                    LIMIT :limit
                    """
                ),
                {"lon": lon, "lat": lat, "radius_meters": radius_km * 1000, "limit": limit},
            ).mappings().all()
            if not rows:
                return []
            return [DrainAsset(**dict(row)) for row in rows]
        except Exception:
            # Fall back to the deterministic haversine calculation when the Postgres/PostGIS instance
            # is unavailable or the spatial columns have not been provisioned yet.
            pass

    assets = db.query(DrainAsset).all()
    filtered = [
        asset
        for asset in assets
        if _haversine_km(lat, lon, asset.lat, asset.lon) <= radius_km
    ]
    return filtered[:limit]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
