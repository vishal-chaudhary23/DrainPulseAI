from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.assessment import assess_blockage
from app.auth import apply_tenant_filter, assert_tenant_access, create_demo_session, get_request_context, require_role
from app.data import seed_data
from app.database import (
    Base,
    SessionLocal,
    engine,
    ensure_schema_compatibility,
    get_database_label,
    get_db,
    initialize_postgres_extensions,
    nearby_assets,
)
from app.migrations import run_migrations
from app.logic import build_priority_notes, risk_level_from_score, score_drain
from app.models import DrainAsset, IncidentReport, MaintenanceTask, RainfallScenario, StoredFile, User
from app.schemas import (
    BlockageAssessmentRequest,
    BlockageAssessmentResponse,
    DrainAsset as DrainAssetSchema,
    IncidentReport as IncidentReportSchema,
    IncidentReportCreate,
    InspectionUpdate,
    MaintenanceTaskCreate,
    MaintenanceTask as MaintenanceTaskSchema,
    ScenarioResponse,
    ScenarioSimulationRequest,
    ScenarioSimulationResponse,
)
from app.storage import (
    SIGNED_URL_TTL_SECONDS,
    StorageConfigurationError,
    StorageOperationError,
    UploadValidationError,
    build_object_key,
    create_download_url,
    delete_object,
    store_object,
    validate_upload,
)

app = FastAPI(title="DrainPulse AI API", version="1.0.0")
logger = logging.getLogger(__name__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def _temporary_file_url(stored_file: StoredFile) -> str:
    try:
        return create_download_url(stored_file.object_key, stored_file.original_filename, stored_file.content_type)
    except StorageConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except StorageOperationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _require_file_access(request: Request, stored_file: StoredFile) -> None:
    assert_tenant_access(request, stored_file.tenant_id)


def _upload_response(stored_file: StoredFile, download_url: str) -> dict[str, str | int]:
    return {
        "id": stored_file.id,
        "purpose": stored_file.purpose,
        "filename": stored_file.original_filename,
        "content_type": stored_file.content_type,
        "size_bytes": stored_file.size_bytes,
        "download_url": download_url,
        "expires_in": SIGNED_URL_TTL_SECONDS,
    }


@app.on_event("startup")
def initialize_database() -> None:
    initialize_postgres_extensions()
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility()
    run_migrations()
    with SessionLocal() as db:
        if db.query(DrainAsset).count() == 0:
            assets, reports, tasks, scenarios = seed_data()
            db.add_all(assets)
            db.add_all(reports)
            db.add_all(tasks)
            db.add_all(scenarios)
        if db.query(User).count() == 0:
            db.add_all(
                [
                    User(tenant_id="default", email="ops@drainpulse.local", name="Operations Lead", role="admin"),
                    User(tenant_id="default", email="field@drainpulse.local", name="Field Supervisor", role="supervisor"),
                    User(tenant_id="default", email="inspector@drainpulse.local", name="Inspector", role="operator"),
                ]
            )
        db.commit()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "DrainPulse AI", "database": get_database_label()}


@app.post("/api/auth/login")
async def login(request: Request) -> dict[str, str]:
    try:
        body = await request.json()
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    email = body.get("email", "ops@drainpulse.local")
    role = body.get("role", "operator")
    tenant_id = body.get("tenant_id", "default")
    return create_demo_session(email=email, role=role, tenant_id=tenant_id)


@app.get("/api/auth/session")
def get_session(request: Request) -> dict[str, str]:
    context = get_request_context(request)
    return {
        "email": context["email"],
        "role": context["role"],
        "tenant_id": context["tenant_id"],
        "token": context["token"],
    }

@app.get("/api/assets", response_model=list[DrainAssetSchema])
def get_assets(
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> list[DrainAsset]:
    query = select(DrainAsset)
    filtered = apply_tenant_filter(request, query, DrainAsset)
    assets = db.scalars(filtered).all()
    for asset in assets:
        if asset.tenant_id is None:
            asset.tenant_id = "default"
        asset.risk = score_drain(asset, 42.0)
        asset.recommendation = build_priority_notes(asset, 42.0)
    return assets


@app.get("/api/spatial/assets")
def get_nearby_assets(
    lat: float,
    lon: float,
    radius_km: float = 5.0,
    request: Request = None,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> list[dict[str, float | int | str]]:
    if request is None:
        raise HTTPException(status_code=400, detail="Request context is required")
    query = apply_tenant_filter(request, select(DrainAsset), DrainAsset)
    items = db.scalars(query).all()
    if lat is None or lon is None:
        raise HTTPException(status_code=400, detail="lat and lon are required")

    if not items:
        return []

    nearby = nearby_assets(db, lat, lon, radius_km=radius_km, limit=10)
    if not nearby:
        nearby = [
            asset for asset in items
            if abs(asset.lat - lat) <= 0.5 and abs(asset.lon - lon) <= 0.5
        ]
    return [
        {
            "id": asset.id,
            "name": asset.name,
            "zone": asset.zone,
            "ward": asset.ward,
            "lat": asset.lat,
            "lon": asset.lon,
            "priority": asset.priority,
            "risk": score_drain(asset, 42),
        }
        for asset in nearby[:10]
    ]


@app.get("/api/reports", response_model=list[IncidentReportSchema])
def get_reports(
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> list[IncidentReportSchema]:
    query = select(IncidentReport)
    filtered = apply_tenant_filter(request, query, IncidentReport)
    reports = db.scalars(filtered).all()
    result = []
    for report in reports:
        response = IncidentReportSchema.model_validate(report)
        if report.photo_file_id is not None:
            stored_file = db.get(StoredFile, report.photo_file_id)
            if stored_file is None:
                raise HTTPException(status_code=500, detail="Incident photo metadata is missing.")
            _require_file_access(request, stored_file)
            response = response.model_copy(update={"photo_url": _temporary_file_url(stored_file)})
        result.append(response)
    return result


@app.get("/api/scenarios", response_model=list[ScenarioResponse])
def get_scenarios(
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> list[RainfallScenario]:
    query = select(RainfallScenario)
    filtered = apply_tenant_filter(request, query, RainfallScenario)
    scenarios = db.scalars(filtered).all()
    if not scenarios:
        fallback = seed_data()[3]
        db.add_all(fallback)
        db.commit()
        return db.scalars(apply_tenant_filter(request, select(RainfallScenario), RainfallScenario)).all()
    return scenarios


@app.post("/api/scenarios/simulate", response_model=ScenarioSimulationResponse)
def simulate_scenario(
    payload: ScenarioSimulationRequest,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> ScenarioSimulationResponse:
    query = apply_tenant_filter(request, select(DrainAsset), DrainAsset)
    assets = db.scalars(query).all()
    if not assets:
        raise HTTPException(status_code=404, detail="No assets available for simulation")

    rainfall_mm = payload.rainfall_mm
    scenario = None
    if payload.scenario_id is not None:
        scenario = db.get(RainfallScenario, payload.scenario_id)
        if scenario is not None and rainfall_mm is None:
            rainfall_mm = scenario.intensity_mm

    if rainfall_mm is None:
        rainfall_mm = max(
            (item.intensity_mm for item in db.scalars(apply_tenant_filter(request, select(RainfallScenario), RainfallScenario)).all()),
            default=42.0,
        )
    rainfall_mm = float(rainfall_mm)

    if scenario is None:
        scenario = RainfallScenario(
            id=0,
            tenant_id=get_request_context(request)["tenant_id"],
            name="Custom rainfall",
            intensity_mm=rainfall_mm,
            duration_hours=3,
            return_period="custom",
            risk_factor=1.0,
            recommendation="Manual scenario evaluation generated by operator input.",
        )

    simulated = []
    for asset in assets:
        risk_score = score_drain(asset, rainfall_mm)
        priority = risk_level_from_score(risk_score)
        simulated.append({
            "id": asset.id,
            "name": asset.name,
            "zone": asset.zone,
            "ward": asset.ward,
            "risk": risk_score,
            "priority": priority,
            "recommendation": build_priority_notes(asset, rainfall_mm),
            "condition_score": asset.condition_score,
            "status": asset.status,
        })

    ranked = sorted(simulated, key=lambda item: item["risk"], reverse=True)

    return ScenarioSimulationResponse(
        scenario_id=scenario.id if scenario and scenario.id else 0,
        rainfall_mm=rainfall_mm,
        risk_index=round(sum(item["risk"] for item in ranked) / len(ranked), 1) if ranked else 0.0,
        critical_assets=sum(1 for item in ranked if item["risk"] >= 75),
        high_priority=sum(1 for item in ranked if 55 <= item["risk"] < 75),
        top_assets=[
            {
                "id": item["id"],
                "name": item["name"],
                "zone": item["zone"],
                "ward": item["ward"],
                "risk": item["risk"],
                "priority": item["priority"],
                "recommendation": item["recommendation"],
                "condition_score": item["condition_score"],
                "status": item["status"],
            }
            for item in ranked[:5]
        ],
    )

@app.get("/api/tasks", response_model=list[MaintenanceTaskSchema])
def get_tasks(
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> list[MaintenanceTask]:
    query = select(MaintenanceTask)
    filtered = apply_tenant_filter(request, query, MaintenanceTask)
    return db.scalars(filtered).all()


@app.get("/api/dashboard")
def get_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> dict[str, Any]:
    query_assets = apply_tenant_filter(request, select(DrainAsset), DrainAsset)
    query_reports = apply_tenant_filter(request, select(IncidentReport), IncidentReport)
    query_scenarios = apply_tenant_filter(request, select(RainfallScenario), RainfallScenario)
    query_tasks = apply_tenant_filter(request, select(MaintenanceTask), MaintenanceTask)

    assets = db.scalars(query_assets).all()
    reports = db.scalars(query_reports).all()
    scenarios = db.scalars(query_scenarios).all()
    tasks = db.scalars(query_tasks).all()

    if not assets:
        return {"assets": [], "summary": {}, "chart": [], "reports": []}

    rainfall_mm = scenarios[0].intensity_mm if scenarios else 42.0
    asset_scores = [score_drain(asset, rainfall_mm) for asset in assets]
    total_risk = round(sum(asset_scores) / len(asset_scores), 1)
    critical_assets = sum(1 for score in asset_scores if score >= 75)
    high_assets = sum(1 for score in asset_scores if 55 <= score < 75)
    zone_distribution = Counter(asset.zone for asset in assets)

    ranked = sorted(
        assets,
        key=lambda item: score_drain(item, rainfall_mm),
        reverse=True,
    )

    summary = {
        "city": "Delhi",
        "total_assets": len(assets),
        "risk_index": total_risk,
        "critical_assets": critical_assets,
        "high_priority": high_assets,
        "open_reports": len(reports),
        "active_tasks": len(tasks),
    }

    chart = [
        {"name": asset.name, "risk": score_drain(asset, rainfall_mm), "condition": asset.condition_score}
        for asset in ranked[:6]
    ]

    return {
        "summary": summary,
        "chart": chart,
        "zones": [{"name": zone, "value": count} for zone, count in zone_distribution.items()],
        "top_assets": [
            {
                "id": asset.id,
                "name": asset.name,
                "zone": asset.zone,
                "risk": score_drain(asset, rainfall_mm),
                "priority": risk_level_from_score(score_drain(asset, rainfall_mm)),
                "recommendation": build_priority_notes(asset, rainfall_mm),
            }
            for asset in ranked[:5]
        ],
        "report_count_by_severity": dict(Counter(report.severity for report in reports)),
    }


@app.post("/api/submit-report", response_model=IncidentReportSchema)
def submit_report(
    payload: IncidentReportCreate,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> IncidentReport:
    context = get_request_context(request)
    stored_file = None
    if payload.photo_file_id is not None:
        stored_file = db.get(StoredFile, payload.photo_file_id)
        if stored_file is None:
            raise HTTPException(status_code=404, detail="Uploaded incident photo was not found.")
        _require_file_access(request, stored_file)
        if stored_file.tenant_id != context["tenant_id"]:
            raise HTTPException(status_code=403, detail="The incident photo belongs to a different tenant.")
        if stored_file.purpose != "incident_photo" or stored_file.related_type is not None:
            raise HTTPException(status_code=400, detail="The uploaded file cannot be attached to this incident.")
        photo_url = _temporary_file_url(stored_file)
    else:
        photo_url = payload.photo_url
    report = IncidentReport(
        tenant_id=context["tenant_id"],
        title=payload.title,
        description=payload.description,
        lat=payload.lat,
        lon=payload.lon,
        severity=payload.severity,
        reporter_type=payload.reporter_type,
        status=payload.status,
        photo_url="" if stored_file is not None else payload.photo_url,
        photo_file_id=payload.photo_file_id,
    )
    db.add(report)
    try:
        db.flush()
        if stored_file is not None:
            stored_file.related_type = "incident_report"
            stored_file.related_id = report.id
        db.commit()
        db.refresh(report)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Incident report could not be saved.") from exc
    response = IncidentReportSchema.model_validate(report)
    if stored_file is not None:
        response = response.model_copy(update={"photo_url": photo_url})
    return response


@app.post("/api/files/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    purpose: str = Form(...),
    related_asset_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> dict[str, str | int]:
    context = get_request_context(request)
    body = await file.read(10 * 1024 * 1024 + 1)
    try:
        validated = validate_upload(file.filename or "", file.content_type, body, purpose)
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    related_asset = None
    if related_asset_id is not None:
        if purpose not in {"inspection_image", "infrastructure_document"}:
            raise HTTPException(status_code=400, detail="This upload purpose cannot be attached to a drainage asset.")
        related_asset = db.get(DrainAsset, related_asset_id)
        if related_asset is None:
            raise HTTPException(status_code=404, detail="Drain asset not found.")
        try:
            assert_tenant_access(request, related_asset.tenant_id)
        except HTTPException:
            raise

    tenant_id = related_asset.tenant_id if related_asset is not None and context["role"] == "admin" else context["tenant_id"]
    object_key = build_object_key(tenant_id, purpose, validated.extension)
    try:
        store_object(object_key, body, validated.content_type)
    except StorageConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except StorageOperationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    try:
        download_url = create_download_url(object_key, validated.original_filename, validated.content_type)
    except StorageConfigurationError as exc:
        try:
            delete_object(object_key)
        except (StorageConfigurationError, StorageOperationError):
            logger.exception("Unable to remove uploaded S3 object after signing configuration failed.")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except StorageOperationError as exc:
        try:
            delete_object(object_key)
        except (StorageConfigurationError, StorageOperationError):
            logger.exception("Unable to remove uploaded S3 object after signing failed.")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    stored_file = StoredFile(
        tenant_id=tenant_id,
        purpose=purpose,
        original_filename=validated.original_filename,
        content_type=validated.content_type,
        size_bytes=len(body),
        object_key=object_key,
        related_type=(
            "drain_asset"
            if related_asset is not None and purpose == "infrastructure_document"
            else None
        ),
        related_id=(
            related_asset.id
            if related_asset is not None and purpose == "infrastructure_document"
            else None
        ),
    )
    db.add(stored_file)
    try:
        db.commit()
        db.refresh(stored_file)
    except SQLAlchemyError as exc:
        db.rollback()
        try:
            delete_object(object_key)
        except (StorageConfigurationError, StorageOperationError):
            logger.exception("Unable to remove orphaned S3 object after metadata insert failed.")
        raise HTTPException(status_code=500, detail="File metadata could not be saved.") from exc
    return _upload_response(stored_file, download_url)


@app.get("/api/files/{file_id}/download-url")
def get_file_download_url(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> dict[str, str | int]:
    stored_file = db.get(StoredFile, file_id)
    if stored_file is None:
        raise HTTPException(status_code=404, detail="File not found.")
    _require_file_access(request, stored_file)
    return {
        "download_url": _temporary_file_url(stored_file),
        "expires_in": SIGNED_URL_TTL_SECONDS,
    }


@app.delete("/api/files/{file_id}", status_code=204)
def delete_unattached_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> None:
    stored_file = db.get(StoredFile, file_id)
    if stored_file is None:
        raise HTTPException(status_code=404, detail="File not found.")
    _require_file_access(request, stored_file)
    if stored_file.related_type is not None:
        raise HTTPException(status_code=409, detail="A file attached to an operational record cannot be deleted here.")
    try:
        delete_object(stored_file.object_key)
    except StorageConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except StorageOperationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db.delete(stored_file)
    db.commit()


@app.post("/api/inspections")
def update_inspection(
    payload: InspectionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> dict[str, str | int]:
    asset = db.get(DrainAsset, payload.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    tenant_id = get_request_context(request)["tenant_id"]
    role = get_request_context(request)["role"]
    if role != "admin" and asset.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Asset not in current tenant")

    asset.status = payload.status
    if payload.condition_score is not None:
        asset.condition_score = payload.condition_score
    if payload.priority is not None:
        asset.priority = payload.priority
    if payload.inspection_file_id is not None:
        stored_file = db.get(StoredFile, payload.inspection_file_id)
        if stored_file is None:
            raise HTTPException(status_code=404, detail="Inspection image was not found.")
        _require_file_access(request, stored_file)
        if stored_file.tenant_id != asset.tenant_id:
            raise HTTPException(status_code=403, detail="The inspection image belongs to a different tenant.")
        if stored_file.purpose != "inspection_image":
            raise HTTPException(status_code=400, detail="The uploaded file is not an inspection image.")
        if stored_file.related_type not in {None, "drain_asset"} or stored_file.related_id not in {None, asset.id}:
            raise HTTPException(status_code=400, detail="The inspection image is linked to a different asset.")
        stored_file.related_type = "drain_asset"
        stored_file.related_id = asset.id
    asset.notes = f"Inspection update: {payload.status}."
    db.commit()
    return {"status": "updated", "asset_id": payload.asset_id}


@app.post("/api/assess-blockage", response_model=BlockageAssessmentResponse)
def assess_blockage_endpoint(
    payload: BlockageAssessmentRequest,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor", "operator")),
) -> BlockageAssessmentResponse:
    if payload.drain_id is not None:
        asset = db.get(DrainAsset, payload.drain_id)
        if asset is None:
            raise HTTPException(status_code=404, detail="Drain asset not found")
        tenant_id = get_request_context(request)["tenant_id"]
        role = get_request_context(request)["role"]
        if role != "admin" and asset.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Asset not in current tenant")

    return assess_blockage(payload)


@app.post("/api/tasks", response_model=MaintenanceTaskSchema)
def create_task(
    payload: MaintenanceTaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    _context: dict[str, str] = Depends(require_role("admin", "supervisor")),
) -> MaintenanceTask:
    context = get_request_context(request)
    task = MaintenanceTask(
        tenant_id=context["tenant_id"],
        drain_id=payload.drain_id,
        title=payload.title,
        crew=payload.crew,
        priority=payload.priority,
        status=payload.status,
        due_hours=payload.due_hours,
        estimated_duration=payload.estimated_duration,
        notes=payload.notes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
