from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, default="operator")
    is_active = Column(Boolean, default=True)


class DrainAsset(Base):
    __tablename__ = "drain_assets"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True)
    name = Column(String, nullable=False)
    zone = Column(String, nullable=False)
    ward = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    condition_score = Column(Float, default=0.0)
    blockage = Column(Float, default=0.0)
    silt = Column(Float, default=0.0)
    terrain = Column(Float, default=0.0)
    maintenance_pressure = Column(Float, default=0.0)
    capacity = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    priority = Column(String, default="moderate")
    last_inspection = Column(String, default="2026-09-15")
    status = Column(String, default="monitor")
    notes = Column(Text, default="")


class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    severity = Column(String, nullable=False)
    reporter_type = Column(String, nullable=False)
    status = Column(String, default="new")
    photo_url = Column(String, default="")
    photo_file_id = Column(Integer, nullable=True)


class StoredFile(Base):
    __tablename__ = "stored_files"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, nullable=False, index=True)
    purpose = Column(String, nullable=False, index=True)
    original_filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    object_key = Column(String, nullable=False, unique=True)
    related_type = Column(String, nullable=True)
    related_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True)
    drain_id = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    crew = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    status = Column(String, default="pending")
    due_hours = Column(Integer, default=12)
    estimated_duration = Column(Integer, default=8)
    notes = Column(Text, default="")


class RainfallScenario(Base):
    __tablename__ = "rainfall_scenarios"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String, default="default", index=True)
    name = Column(String, nullable=False)
    intensity_mm = Column(Float, nullable=False)
    duration_hours = Column(Float, nullable=False)
    return_period = Column(String, nullable=False)
    risk_factor = Column(Float, nullable=False)
    recommendation = Column(String, default="")
