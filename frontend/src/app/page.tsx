"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  Users,
  Wrench,
  CloudRain,
  ArrowUpRight,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import DrainMap from "@/components/DrainMap";
import {
  DrainAsset,
  IncidentReport,
  RainfallScenario,
  DashboardPayload,
  fetchDashboard,
  fetchAssets,
  fetchReports,
  fetchScenarios,
  simulateScenario,
} from "@/lib/api";

export default function OperationalOverviewPage() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [assets, setAssets] = useState<DrainAsset[]>([]);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [scenarios, setScenarios] = useState<RainfallScenario[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<DrainAsset | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simulationApplied, setSimulationApplied] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Load initial operational data
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [dashData, assetData, reportData, scenarioData] = await Promise.all([
          fetchDashboard(),
          fetchAssets(),
          fetchReports(),
          fetchScenarios(),
        ]);
        setDashboard(dashData);
        setAssets(assetData);
        setReports(reportData);
        setScenarios(scenarioData);
        if (assetData.length > 0) {
          setSelectedAsset(assetData[0]);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId]
  );

  // Dynamically simulate scenario when active scenario changes
  const handleScenarioChange = async (scenarioId: number) => {
    setSelectedScenarioId(scenarioId);
    const targetScenario = scenarios.find((s) => s.id === scenarioId);
    if (!targetScenario) return;

    setSimulating(true);
    setSimulationError(null);
    setSimulationApplied(false);
    try {
      const simResult = await simulateScenario(targetScenario.id, targetScenario.intensity_mm);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            risk_index: simResult.risk_index,
            critical_assets: simResult.critical_assets,
            high_priority: simResult.high_priority,
          },
        };
      });

      // Update assets with simulated scores
      setAssets((prev) =>
        prev.map((asset) => {
          const match = simResult.top_assets.find((t) => t.id === asset.id);
          if (match) {
            return {
              ...asset,
              risk: match.risk,
              priority: match.priority as any,
              recommendation: match.recommendation,
            };
          }
          return asset;
        })
      );
      setSimulationApplied(true);
    } catch (err) {
      console.warn("Simulation call error:", err);
      setSimulationError(err instanceof Error ? err.message : "Scenario simulation failed. Try again.");
    } finally {
      setSimulating(false);
    }
  };

  const priorityList = useMemo(
    () => [...assets].sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0)).slice(0, 5),
    [assets]
  );

  return (
    <div className="dashboard-content space-y-5 p-4 sm:p-5 xl:p-7">
      {/* Top Operations Header & Context Bar */}
      <div className="dashboard-header flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-center xl:justify-between dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <p className="meta-eyebrow font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Delhi NCT · City operations
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
            Delhi Drainage Intelligence
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)] sm:text-sm">
            Observe the network, simulate rainfall, prioritise intervention.
          </p>
        </div>

        {/* Operational Context Controls */}
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--foreground)] shadow-[var(--card-shadow)]">
            <Calendar className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            <span className="whitespace-nowrap">Monsoon Cycle 2026</span>
          </div>
          <div className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs text-[var(--muted)]">
            <span className={`status-dot shrink-0 ${loading ? "unknown" : dashboard ? "resolved" : "critical"}`} aria-hidden="true" />
            <span className="whitespace-nowrap">
              {loading ? "Syncing data…" : dashboard ? "API data current" : "API unavailable"}
            </span>
          </div>
        </div>
      </div>

      {/* Compact operational readout strip */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-[var(--card-shadow)] sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Basin risk index", value: dashboard?.summary.risk_index ?? "—", suffix: "/100", icon: ShieldAlert, tone: "text-[var(--primary)]", surface: "bg-teal-50 dark:bg-teal-950/50" },
          { label: "Critical drains", value: dashboard?.summary.critical_assets ?? "—", suffix: "≥75 risk", icon: AlertTriangle, tone: "text-red-600 dark:text-red-400", surface: "bg-red-50 dark:bg-red-950/40" },
          { label: "Open incidents", value: dashboard?.summary.open_reports ?? reports.length, suffix: "in queue", icon: Users, tone: "text-amber-700 dark:text-amber-400", surface: "bg-amber-50 dark:bg-amber-950/40" },
          { label: "Active work orders", value: dashboard?.summary.active_tasks ?? "—", suffix: "active", icon: Wrench, tone: "text-sky-700 dark:text-sky-400", surface: "bg-sky-50 dark:bg-sky-950/40" },
          { label: "Mapped assets", value: dashboard?.summary.total_assets ?? assets.length, suffix: "network nodes", icon: Layers, tone: "text-[var(--primary)]", surface: "bg-teal-50 dark:bg-teal-950/50" },
        ].map(({ label, value, suffix, icon: Icon, tone, surface }) => (
          <div key={label} className="kpi-card group flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-3 transition duration-150 hover:-translate-y-px hover:border-[var(--border)] hover:shadow-[var(--card-shadow)] sm:px-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${surface}`}>
              <Icon className={`h-[18px] w-[18px] ${tone}`} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium text-[var(--muted)]">{label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-mono-numbers text-xl font-semibold leading-none tracking-tight text-[var(--foreground)]">{value}</span>
                <span className="truncate text-[10px] text-[var(--muted)]">{suffix}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Operational Area: Map Cockpit (65%) + Context & Scenario Controls (35%) */}
      <div className="grid min-w-0 gap-5 xl:grid-cols-12">
        {/* Interactive GIS Map Workspace (Occupies 8 Cols, ~67% width) */}
        <section className="map-workspace min-w-0 space-y-3 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[var(--primary)] ring-4 ring-teal-100 dark:ring-teal-950" />
              <h3 className="text-sm font-semibold text-[var(--foreground)] sm:text-base">
                Drainage network & risk surface
              </h3>
            </div>
            <Link
              href="/map"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400 dark:hover:bg-sky-950/50"
            >
              Open GIS workbench <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <DrainMap
            assets={assets}
            reports={reports}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            height="clamp(440px, 66vh, 700px)"
          />
        </section>

        {/* Right Side Operational Panels (4 Cols) */}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          {/* Active Rainfall Scenario Simulation Selector */}
          <section className="dashboard-panel rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)] sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">
                  <CloudRain className="h-4 w-4" />
                </span>
                <h4 className="text-sm font-semibold text-[var(--foreground)]">
                  Scenario engine
                </h4>
              </div>
              {simulating && (
                <span role="status" className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Running
                </span>
              )}
            </div>

            <div className="mt-4">
              <label htmlFor="dashboard-scenario" className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Rainfall scenario</label>
              <select
                id="dashboard-scenario"
                value={selectedScenarioId}
                onChange={(e) => handleScenarioChange(Number(e.target.value))}
                disabled={simulating || scenarios.length === 0}
                className="mt-1.5 min-h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] outline-none transition hover:border-[var(--border-strong)] focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-teal-100 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-teal-900"
              >
                {scenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scenario Projected Telemetry */}
            <div className="mt-3 rounded-lg border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-3.5 dark:border-sky-900 dark:from-sky-950/50 dark:to-slate-900">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Projected rainfall intensity
                </span>
                <span className="font-mono-numbers text-xl font-semibold tracking-tight text-sky-800 dark:text-sky-300">
                  {activeScenario?.intensity_mm ?? 72} mm/hr
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-sky-100 pt-2.5 text-[11px] dark:border-sky-900">
                <div><span className="block text-slate-500 dark:text-slate-400">Duration</span><span className="mt-0.5 block font-medium text-slate-800 dark:text-slate-200">{activeScenario?.duration_hours ?? 4} hours</span></div>
                <div><span className="block text-slate-500 dark:text-slate-400">Return period</span><span className="mt-0.5 block font-medium text-slate-800 dark:text-slate-200">{activeScenario?.return_period ?? "5-year"}</span></div>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              <strong className="font-semibold text-[var(--foreground)]">Recommended response: </strong>
              {activeScenario?.recommendation ?? "Trigger emergency desilting in high-risk zones."}
            </p>

            {simulationError && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{simulationError}</p>}
            {simulationApplied && !simulating && <p role="status" className="mt-3 flex items-center gap-2 text-[11px] font-medium text-teal-700 dark:text-teal-300"><span className="status-dot resolved" /> Scenario projection updated · simulated, not observed</p>}

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <Link
                href="/simulator"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                Open full simulator <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          {/* Quick Selected Asset Summary */}
          {selectedAsset && (
            <section className="dashboard-panel rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--card-shadow)] sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">Selected drain</div>
                  <div className="mt-0.5 text-[10px] text-[var(--muted)]">Network asset overview</div>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    selectedAsset.priority === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  }`}
                >
                  {selectedAsset.priority}
                </span>
              </div>
              <h4 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                {selectedAsset.name}
              </h4>
              <p className="text-xs text-[var(--muted)]">
                {selectedAsset.ward} · {selectedAsset.zone}
              </p>

              <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)] py-3 text-center">
                <div>
                  <div className="text-[10px] font-medium text-[var(--muted)]">Risk score</div>
                  <div className="mt-1 font-mono-numbers text-lg font-semibold text-red-600 dark:text-red-400">
                    {selectedAsset.risk ?? 60}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-[var(--muted)]">Blockage</div>
                  <div className="mt-1 font-mono-numbers text-lg font-semibold text-[var(--foreground)]">
                    {selectedAsset.blockage}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-[var(--muted)]">Silt surcharge</div>
                  <div className="mt-1 font-mono-numbers text-lg font-semibold text-[var(--foreground)]">
                    {selectedAsset.silt}%
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <Link
                  href={`/inspections?asset_id=${selectedAsset.id}`}
                  className="rounded px-1 py-1 font-semibold text-sky-700 transition hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Log AI Inspection →
                </Link>
                <Link
                  href={`/work-orders?asset_id=${selectedAsset.id}`}
                  className="rounded px-1 py-1 font-semibold text-teal-700 transition hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:text-teal-300 dark:hover:text-teal-200"
                >
                  Dispatch Crew →
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Secondary Operational Area: Priority Action Queue & Citizen Incident Feed */}
      <div className="grid min-w-0 gap-5 xl:grid-cols-12">
        {/* Priority Maintenance & Inspection Queue (7 Cols) — compact row list */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)] xl:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Municipal Action Queue
              </h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Ranked by hydraulic surcharge vulnerability</p>
            </div>
            <Link
              href="/network"
              className="shrink-0 rounded px-2 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400 dark:hover:bg-sky-950/50"
            >
              Network ({assets.length}) →
            </Link>
          </div>

          <div className="divide-y divide-[var(--border)] px-3 sm:px-4">
            {priorityList.length > 0 ? priorityList.map((asset, index) => (
              <button
                type="button"
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className={`flex w-full items-center justify-between gap-3 px-2 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--primary)] dark:hover:bg-slate-800/50 ${
                  selectedAsset?.id === asset.id ? "bg-teal-50/70 dark:bg-teal-950/20" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                    index === 0 ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--foreground)] truncate">
                      {asset.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                      <span className="asset-id-badge">DP-DEL-{String(asset.id).padStart(4,"0")}</span>
                      <span>·</span>
                      <span className="truncate">{asset.ward}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <div className="text-right">
                    <span className="block font-mono-numbers text-sm font-semibold text-[var(--foreground)]">
                      {asset.risk ?? 60}
                    </span>
                    <span className="block text-[9px] uppercase tracking-wide text-[var(--muted)]">risk</span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      asset.priority === "critical"
                        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        : asset.priority === "high"
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {asset.priority}
                  </span>
                </div>
              </button>
            )) : <div className="px-3 py-8 text-center text-xs text-[var(--muted)]">{loading ? "Loading priority assets…" : "No drainage assets are currently available."}</div>}
          </div>
        </section>

        {/* Live Citizen & Field Incident Feed (5 Cols) — scrollable */}
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--card-shadow)] xl:col-span-5">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                Field Incident Feed
              </h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Citizen submissions and patrol flags</p>
            </div>
            <Link
              href="/reports"
              className="shrink-0 rounded px-2 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-400 dark:hover:bg-sky-950/50"
            >
              Triage ({reports.length}) →
            </Link>
          </div>

          <div className="panel-scroll divide-y divide-[var(--border)] px-4">
            {reports.length > 0 ? reports.map((report) => (
              <div
                key={report.id}
                className="py-3.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`status-dot ${
                        report.severity === "critical" ? "critical" :
                        report.severity === "high" ? "high" : "warning"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] font-medium capitalize text-[var(--muted)]">{report.reporter_type} report</span>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                      report.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : report.status === "assigned"
                        ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                        : report.status === "in_review"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {report.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1.5 font-semibold text-[var(--foreground)]">{report.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)] line-clamp-2">
                  {report.description}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)]">
                  <span className="capitalize">{report.reporter_type}</span>
                  <span className="asset-id-badge">DP-REP-{String(report.id).padStart(4,"0")}</span>
                </div>
              </div>
            )) : <div className="px-3 py-8 text-center text-xs text-[var(--muted)]">{loading ? "Loading incident reports…" : "No active incidents to show."}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
