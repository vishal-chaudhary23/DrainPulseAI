export interface DrainAsset {
  id: number;
  tenant_id?: string;
  name: string;
  zone: string;
  ward: string;
  lat: number;
  lon: number;
  condition_score: number;
  blockage: number;
  silt: number;
  terrain: number;
  maintenance_pressure: number;
  capacity: number;
  confidence: number;
  priority: "critical" | "high" | "moderate" | "low";
  last_inspection: string;
  status: "monitor" | "inspection" | "priority" | "cleared";
  notes: string;
  risk?: number;
  recommendation?: string;
}

export interface IncidentReport {
  id: number;
  tenant_id?: string;
  title: string;
  description: string;
  lat: number;
  lon: number;
  severity: "critical" | "high" | "medium" | "low";
  reporter_type: "citizen" | "inspector" | "operator";
  status: "new" | "in_review" | "assigned" | "resolved";
  photo_url: string;
  photo_file_id?: number | null;
}

export interface UploadedFile {
  id: number;
  purpose: "incident_photo" | "inspection_image" | "infrastructure_document";
  filename: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
  expires_in: number;
}

export interface MaintenanceTask {
  id: number;
  tenant_id?: string;
  drain_id: number;
  title: string;
  crew: string;
  priority: "critical" | "high" | "moderate" | "low";
  status: "pending" | "scheduled" | "in_progress" | "completed";
  due_hours: number;
  estimated_duration: number;
  notes: string;
}

export interface RainfallScenario {
  id: number;
  tenant_id?: string;
  name: string;
  intensity_mm: number;
  duration_hours: number;
  return_period: string;
  risk_factor: number;
  recommendation: string;
}

export interface ScenarioSimulationAsset {
  id: number;
  name: string;
  zone: string;
  ward: string;
  risk: number;
  priority: string;
  recommendation: string;
  condition_score: number;
  status: string;
}

export interface ScenarioSimulationResponse {
  scenario_id: number;
  rainfall_mm: number;
  risk_index: number;
  critical_assets: number;
  high_priority: number;
  top_assets: ScenarioSimulationAsset[];
}

export interface DashboardPayload {
  summary: {
    city: string;
    total_assets: number;
    risk_index: number;
    critical_assets: number;
    high_priority: number;
    open_reports: number;
    active_tasks: number;
  };
  chart: { name: string; risk: number; condition: number }[];
  zones: { name: string; value: number }[];
  top_assets: DrainAsset[];
  report_count_by_severity: Record<string, number>;
}

export interface BlockageAssessmentRequest {
  drain_id?: number | null;
  image_url?: string;
  description: string;
  visible_waste: number;
  silt_depth: number;
  standing_water: number;
  flow_obstruction: number;
}

export interface BlockageAssessmentResponse {
  drain_id: number | null;
  score: number;
  confidence: number;
  status: "low" | "moderate" | "high" | "critical";
  recommendation: string;
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Fallback municipal dataset for Delhi when backend is starting or offline
export const FALLBACK_ASSETS: DrainAsset[] = [
  {
    id: 1,
    name: "Saket Trunk Canal (T-04)",
    zone: "South Delhi",
    ward: "Saket (Ward 162)",
    lat: 28.5203,
    lon: 77.2064,
    condition_score: 54,
    blockage: 82,
    silt: 61,
    terrain: 70,
    maintenance_pressure: 76,
    capacity: 48,
    confidence: 0.89,
    priority: "critical",
    last_inspection: "2026-10-05",
    status: "inspection",
    notes: "Severe plastic accumulation and downstream outfall backwater near residential blocks.",
    risk: 67.5,
    recommendation: "Immediate mechanical desilting and trash-screen clear within 4 hours.",
  },
  {
    id: 2,
    name: "Rohini Sector 15 Collector",
    zone: "North West Delhi",
    ward: "Rohini (Ward 52)",
    lat: 28.7386,
    lon: 77.0614,
    condition_score: 63,
    blockage: 66,
    silt: 58,
    terrain: 62,
    maintenance_pressure: 68,
    capacity: 52,
    confidence: 0.85,
    priority: "high",
    last_inspection: "2026-10-07",
    status: "monitor",
    notes: "Low-lying residential bowl with narrow roadside connections and recurring siltation.",
    risk: 59.5,
    recommendation: "Field team inspection and silt extraction before evening downpour.",
  },
  {
    id: 3,
    name: "Azadpur MDT-6 Outfall Channel",
    zone: "North Delhi",
    ward: "Azadpur (Ward 14)",
    lat: 28.7245,
    lon: 77.1757,
    condition_score: 71,
    blockage: 49,
    silt: 44,
    terrain: 54,
    maintenance_pressure: 58,
    capacity: 69,
    confidence: 0.8,
    priority: "moderate",
    last_inspection: "2026-10-03",
    status: "monitor",
    notes: "High inflow volume during monsoon peak; gradient allows adequate discharge.",
    risk: 47.8,
    recommendation: "Continuous level monitoring and scheduled preventive clean within 48h.",
  },
  {
    id: 4,
    name: "Lajpat Nagar Ring Road Drain",
    zone: "South Delhi",
    ward: "Lajpat Nagar (Ward 141)",
    lat: 28.5665,
    lon: 77.2434,
    condition_score: 48,
    blockage: 78,
    silt: 72,
    terrain: 79,
    maintenance_pressure: 83,
    capacity: 41,
    confidence: 0.92,
    priority: "critical",
    last_inspection: "2026-10-06",
    status: "priority",
    notes: "Roadside storm channel blocked with construction aggregate, root ingress, and utility crossings.",
    risk: 71.4,
    recommendation: "Emergency crew dispatch; deployment of suction machine and road safety cordon.",
  },
  {
    id: 5,
    name: "Bawana Industrial Storm Outfall",
    zone: "North West Delhi",
    ward: "Bawana (Ward 31)",
    lat: 28.7982,
    lon: 77.0568,
    condition_score: 61,
    blockage: 52,
    silt: 64,
    terrain: 58,
    maintenance_pressure: 62,
    capacity: 55,
    confidence: 0.82,
    priority: "high",
    last_inspection: "2026-09-29",
    status: "monitor",
    notes: "Primary industrial outfall receiving industrial runoff; prone to sludge deposition.",
    risk: 55.3,
    recommendation: "Excavator cleaning cycle scheduled; verify flap valve seals.",
  },
  {
    id: 6,
    name: "Shahdara Arterial Nullah",
    zone: "East Delhi",
    ward: "Shahdara (Ward 225)",
    lat: 28.6706,
    lon: 77.2963,
    condition_score: 57,
    blockage: 71,
    silt: 67,
    terrain: 65,
    maintenance_pressure: 74,
    capacity: 46,
    confidence: 0.87,
    priority: "high",
    last_inspection: "2026-10-02",
    status: "inspection",
    notes: "Heavy masonry channel bordering dense habitation; elevated surcharge risk during Yamuna high level.",
    risk: 64.5,
    recommendation: "Pre-monsoon dredging and clearing of solid waste encroachment near bridges.",
  },
];

export const FALLBACK_REPORTS: IncidentReport[] = [
  {
    id: 1,
    title: "Culvert choke near Central Market",
    description: "Inlet grate completely blinded by discarded plastic packaging and silt after 30-min rain.",
    lat: 28.5668,
    lon: 77.2431,
    severity: "high",
    reporter_type: "citizen",
    status: "in_review",
    photo_url: "/images/report-1.jpg",
  },
  {
    id: 2,
    title: "Standing water across Saket Press Enclave Road",
    description: "Pooling water reaching 25cm depth near bus stop; road traffic severely disrupted.",
    lat: 28.5205,
    lon: 77.2068,
    severity: "critical",
    reporter_type: "inspector",
    status: "assigned",
    photo_url: "/images/report-2.jpg",
  },
  {
    id: 3,
    title: "Silt bank accumulation at slipway inlet",
    description: "Upstream slope wash loaded with sand and gravel requiring manual shovel clearance.",
    lat: 28.7385,
    lon: 77.0618,
    severity: "medium",
    reporter_type: "operator",
    status: "new",
    photo_url: "/images/report-3.jpg",
  },
];

export const FALLBACK_TASKS: MaintenanceTask[] = [
  {
    id: 1,
    drain_id: 1,
    title: "Desilt and clear Saket inlet chamber",
    crew: "South Division Mobile Unit 2",
    priority: "critical",
    status: "pending",
    due_hours: 4,
    estimated_duration: 6,
    notes: "Clear screens and dredge 20-meter upstream approach section.",
  },
  {
    id: 2,
    drain_id: 4,
    title: "Excavate construction debris at Lajpat Nagar",
    crew: "Central Zone Rapid Response",
    priority: "critical",
    status: "scheduled",
    due_hours: 6,
    estimated_duration: 7,
    notes: "Requires traffic warden coordination on outer ring carriageway.",
  },
  {
    id: 3,
    drain_id: 6,
    title: "Inspect Shahdara Nullah bridge abutment",
    crew: "East Division Structural Team",
    priority: "high",
    status: "pending",
    due_hours: 8,
    estimated_duration: 5,
    notes: "Verify structural clearance and remove fallen tree limbs from culvert mouth.",
  },
];

export const FALLBACK_SCENARIOS: RainfallScenario[] = [
  {
    id: 1,
    name: "Moderate storm (42 mm/hr)",
    intensity_mm: 42,
    duration_hours: 2,
    return_period: "2-year return",
    risk_factor: 0.68,
    recommendation: "Deploy routine inspection patrols across top vulnerable arterial drains.",
  },
  {
    id: 2,
    name: "Peak monsoon pulse (72 mm/hr)",
    intensity_mm: 72,
    duration_hours: 4,
    return_period: "5-year return",
    risk_factor: 0.88,
    recommendation: "Activate ward-level rapid response teams and pre-position diesel dewatering pumps.",
  },
  {
    id: 3,
    name: "Urban cloudburst stress-test (110 mm/hr)",
    intensity_mm: 110,
    duration_hours: 6,
    return_period: "10-year return",
    risk_factor: 1.05,
    recommendation: "Escalate to municipal disaster authority; enact traffic diversions around underpasses.",
  },
];

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return { status: "local_cache", service: "DrainPulse AI", database: "sqlite" };
}

export async function fetchDashboard(): Promise<DashboardPayload> {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard`, { cache: "no-store" });
    if (res.ok) return await res.json();
  } catch {}
  return {
    summary: {
      city: "Delhi NCT",
      total_assets: 6,
      risk_index: 61.0,
      critical_assets: 2,
      high_priority: 3,
      open_reports: 3,
      active_tasks: 3,
    },
    chart: [
      { name: "Lajpat Nagar", risk: 71.4, condition: 48 },
      { name: "Saket Trunk", risk: 67.5, condition: 54 },
      { name: "Shahdara", risk: 64.5, condition: 57 },
      { name: "Rohini Sec-15", risk: 59.5, condition: 63 },
      { name: "Bawana Storm", risk: 55.3, condition: 61 },
      { name: "Azadpur MDT", risk: 47.8, condition: 71 },
    ],
    zones: [
      { name: "South Delhi", value: 2 },
      { name: "North West Delhi", value: 2 },
      { name: "North Delhi", value: 1 },
      { name: "East Delhi", value: 1 },
    ],
    top_assets: FALLBACK_ASSETS,
    report_count_by_severity: { critical: 1, high: 1, medium: 1 },
  };
}

export async function fetchAssets(): Promise<DrainAsset[]> {
  try {
    const res = await fetch(`${API_BASE}/api/assets`, { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return FALLBACK_ASSETS;
}

export async function fetchReports(): Promise<IncidentReport[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports`, { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return FALLBACK_REPORTS;
}

export async function fetchTasks(): Promise<MaintenanceTask[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return FALLBACK_TASKS;
}

export async function fetchScenarios(): Promise<RainfallScenario[]> {
  try {
    const res = await fetch(`${API_BASE}/api/scenarios`, { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return FALLBACK_SCENARIOS;
}

export async function simulateScenario(scenarioId: number, rainfallMm: number): Promise<ScenarioSimulationResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/scenarios/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId, rainfall_mm: rainfallMm }),
    });
  } catch {
    throw new Error("Could not reach the scenario simulation API.");
  }
  if (!res.ok) {
    throw new Error(`Scenario simulation failed (HTTP ${res.status}).`);
  }
  return await res.json();
}

export async function assessBlockage(payload: BlockageAssessmentRequest): Promise<BlockageAssessmentResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/assess-blockage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the blockage assessment API.");
  }
  if (!res.ok) {
    throw new Error(`Blockage assessment failed (HTTP ${res.status}).`);
  }
  return await res.json();
}

export async function submitReport(payload: Partial<IncidentReport>): Promise<IncidentReport> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/submit-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the incident report API.");
  }
  if (!res.ok) {
    const response = await res.json().catch(() => null);
    throw new Error(response?.detail ?? `Incident report submission failed (HTTP ${res.status}).`);
  }
  return await res.json();
}

export async function uploadFile(
  file: File,
  purpose: UploadedFile["purpose"],
  relatedAssetId?: number
): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  if (relatedAssetId !== undefined) form.append("related_asset_id", String(relatedAssetId));

  const res = await fetch(`${API_BASE}/api/files/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const response = await res.json().catch(() => null);
    throw new Error(response?.detail ?? `File upload failed (HTTP ${res.status}).`);
  }
  return await res.json();
}

export async function deleteUnattachedFile(fileId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) {
    const response = await res.json().catch(() => null);
    throw new Error(response?.detail ?? `Uploaded file cleanup failed (HTTP ${res.status}).`);
  }
}

export async function createTask(payload: Partial<MaintenanceTask>): Promise<MaintenanceTask> {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create maintenance task");
  return await res.json();
}

export async function updateInspection(payload: {
  asset_id: number;
  status: DrainAsset["status"];
  priority: DrainAsset["priority"];
  inspection_file_id?: number;
}): Promise<{ status: string; asset_id: number }> {
  const res = await fetch(`${API_BASE}/api/inspections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Could not save inspection update (HTTP ${res.status}).`);
  }
  return await res.json();
}
