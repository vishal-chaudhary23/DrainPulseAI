from typing import Literal

from pydantic import BaseModel, Field


class DrainAssetBase(BaseModel):
    tenant_id: str = "default"
    name: str
    zone: str
    ward: str
    lat: float
    lon: float
    condition_score: float = 0.0
    blockage: float = 0.0
    silt: float = 0.0
    terrain: float = 0.0
    maintenance_pressure: float = 0.0
    capacity: float = 0.0
    confidence: float = 0.0
    priority: str = "moderate"
    last_inspection: str = "2026-09-15"
    status: str = "monitor"
    notes: str = ""
    risk: float | None = None
    recommendation: str | None = None


class DrainAssetCreate(DrainAssetBase):
    pass


class DrainAsset(DrainAssetBase):
    id: int
    model_config = {"from_attributes": True}


class IncidentReportBase(BaseModel):
    title: str
    description: str
    lat: float
    lon: float
    severity: str
    reporter_type: str = "citizen"
    status: str = "new"
    photo_url: str = ""
    photo_file_id: int | None = None


class IncidentReportCreate(IncidentReportBase):
    pass


class IncidentReport(IncidentReportBase):
    id: int
    model_config = {"from_attributes": True}


class MaintenanceTaskBase(BaseModel):
    drain_id: int
    title: str
    crew: str
    priority: str
    status: str = "pending"
    due_hours: int = 12
    estimated_duration: int = 8
    notes: str = ""


class MaintenanceTaskCreate(MaintenanceTaskBase):
    pass


class MaintenanceTask(MaintenanceTaskBase):
    id: int
    model_config = {"from_attributes": True}


class ScenarioResponse(BaseModel):
    id: int
    name: str
    intensity_mm: float
    duration_hours: float
    return_period: str
    risk_factor: float
    recommendation: str


class ScenarioSimulationRequest(BaseModel):
    scenario_id: int | None = None
    rainfall_mm: float | None = None


class ScenarioSimulationAsset(BaseModel):
    id: int
    name: str
    zone: str
    ward: str
    risk: float
    priority: str
    recommendation: str
    condition_score: float
    status: str


class ScenarioSimulationResponse(BaseModel):
    scenario_id: int
    rainfall_mm: float
    risk_index: float
    critical_assets: int
    high_priority: int
    top_assets: list[ScenarioSimulationAsset]


class BlockageAssessmentRequest(BaseModel):
    drain_id: int | None = None
    image_url: str = ""
    description: str = ""
    visible_waste: float = 0.0
    silt_depth: float = 0.0
    standing_water: float = 0.0
    flow_obstruction: float = 0.0


class BlockageAssessmentResponse(BaseModel):
    drain_id: int | None
    score: float
    confidence: float
    status: str
    recommendation: str


class InspectionUpdate(BaseModel):
    asset_id: int
    status: Literal["monitor", "inspection", "priority", "cleared"]
    condition_score: float | None = None
    priority: str | None = None
    inspection_file_id: int | None = None
