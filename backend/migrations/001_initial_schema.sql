-- DrainPulse initial schema bootstrap for SQLite/PostgreSQL compatibility.
-- Safe to run repeatedly because tables are created with IF NOT EXISTS semantics.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    tenant_id TEXT DEFAULT 'default',
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS drain_assets (
    id INTEGER PRIMARY KEY,
    tenant_id TEXT DEFAULT 'default',
    name TEXT NOT NULL,
    zone TEXT NOT NULL,
    ward TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    condition_score REAL DEFAULT 0.0,
    blockage REAL DEFAULT 0.0,
    silt REAL DEFAULT 0.0,
    terrain REAL DEFAULT 0.0,
    maintenance_pressure REAL DEFAULT 0.0,
    capacity REAL DEFAULT 0.0,
    confidence REAL DEFAULT 0.0,
    priority TEXT DEFAULT 'moderate',
    last_inspection TEXT DEFAULT '2026-09-15',
    status TEXT DEFAULT 'monitor',
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS incident_reports (
    id INTEGER PRIMARY KEY,
    tenant_id TEXT DEFAULT 'default',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    severity TEXT NOT NULL,
    reporter_type TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    photo_url TEXT DEFAULT '',
    photo_file_id INTEGER
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id INTEGER PRIMARY KEY,
    tenant_id TEXT DEFAULT 'default',
    drain_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    crew TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    due_hours INTEGER DEFAULT 12,
    estimated_duration INTEGER DEFAULT 8,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rainfall_scenarios (
    id INTEGER PRIMARY KEY,
    tenant_id TEXT DEFAULT 'default',
    name TEXT NOT NULL,
    intensity_mm REAL NOT NULL,
    duration_hours REAL NOT NULL,
    return_period TEXT NOT NULL,
    risk_factor REAL NOT NULL,
    recommendation TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_id ON drain_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_id ON incident_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON maintenance_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_tenant_id ON rainfall_scenarios(tenant_id);
