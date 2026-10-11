"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  MapPin,
  Plus,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import { IncidentReport, deleteUnattachedFile, fetchReports, submitReport, uploadFile } from "@/lib/api";

// Stable identifier generator
function formatReportId(id: number): string {
  return `DP-REP-${String(id).padStart(4, "0")}`;
}

// Evidence status derived from report data (not from an AI claim)
type EvidenceStatus = "verified" | "pending" | "flagged" | "unverified";

function getEvidenceStatus(report: IncidentReport): EvidenceStatus {
  if (report.status === "resolved") return "verified";
  if (report.status === "assigned") return "pending";
  if (report.severity === "critical" && report.status === "new") return "flagged";
  return "unverified";
}

function evidenceStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "verified": return "HUMAN VERIFIED";
    case "pending": return "REVIEW PENDING";
    case "flagged": return "FLAGGED — CRITICAL";
    default: return "UNVERIFIED";
  }
}

// Static status dot — no animation
function StatusDot({ severity }: { severity: string }) {
  const cls =
    severity === "critical" ? "status-dot critical" :
    severity === "high" ? "status-dot high" :
    severity === "medium" ? "status-dot warning" : "status-dot unknown";
  return (
    <span className={cls} aria-hidden="true" />
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  const cls =
    status === "resolved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
    status === "assigned" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" :
    status === "in_review" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

export default function CitizenReportsPage() {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSeverity, setNewSeverity] = useState<"critical" | "high" | "medium">("high");
  const [newLat, setNewLat] = useState("28.5668");
  const [newLon, setNewLon] = useState("77.2431");
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusedReportId, setFocusedReportId] = useState<number | null>(null);

  useEffect(() => {
    fetchReports().then((data) => {
      setReports(data);
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("search") ?? "");
      const reportId = Number(params.get("report_id"));
      if (data.some((report) => report.id === reportId)) setFocusedReportId(reportId);
      setLoading(false);
    });
  }, []);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      `${report.title} ${report.description} DP-REP-${String(report.id).padStart(4, "0")}`
        .toLowerCase()
        .includes(query)
    );
  }, [reports, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    let uploadedFileId: number | null = null;
    try {
      const uploadedFile = newPhoto ? await uploadFile(newPhoto, "incident_photo") : null;
      uploadedFileId = uploadedFile?.id ?? null;
      const created = await submitReport({
        title: newTitle,
        description: newDescription,
        severity: newSeverity,
        lat: parseFloat(newLat) || 28.56,
        lon: parseFloat(newLon) || 77.24,
        reporter_type: "citizen",
        status: "new",
        photo_url: "",
        photo_file_id: uploadedFileId,
      });
      setReports((prev) => [created, ...prev]);
      setShowSubmitModal(false);
      setNewTitle("");
      setNewDescription("");
      setNewPhoto(null);
    } catch (err) {
      if (uploadedFileId !== null) {
        try {
          await deleteUnattachedFile(uploadedFileId);
        } catch (cleanupError) {
          console.error("Uploaded incident photo cleanup failed:", cleanupError);
        }
      }
      setSubmitError(err instanceof Error ? err.message : "The incident report could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const severityLabel = (s: string) =>
    s === "critical" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
    s === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" :
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <AlertOctagon className="h-4 w-4" />
            Community Crowdsourcing
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Citizen Reports &amp; Incident Triage
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Field waterlogging submissions, photographic evidence, and civic response routing
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSubmitModal(true)}
          className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Log New Incident
        </button>
      </div>

      {/* Reports grid */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 sm:max-w-sm dark:border-slate-800 dark:bg-slate-900">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter incident reports…"
            aria-label="Filter incident reports"
            className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
        </label>
        <p className="text-xs text-slate-500">
          Report status is read-only here; the current API does not expose triage or assignment updates.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400 text-xs">Loading reports…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report) => {
            const evStatus = getEvidenceStatus(report);
            return (
              <div
                key={report.id}
                className={`flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900 ${
                  report.id === focusedReportId
                    ? "border-sky-500 ring-2 ring-sky-100 dark:border-sky-500 dark:ring-sky-950"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* Evidence photograph */}
                <div
                  className="evidence-img-wrap cursor-pointer"
                  onClick={() => setExpandedPhoto(report.photo_url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setExpandedPhoto(report.photo_url)}
                  aria-label={`View evidence photo for: ${report.title}`}
                >
                  {/* Image with graceful fallback */}
                  {report.photo_url ? (
                    <img
                      src={report.photo_url}
                      alt={`Evidence for: ${report.title}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style");
                      }}
                    />
                  ) : null}
                  {/* Fallback */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center text-slate-400"
                    style={report.photo_url ? { display: "none" } : {}}
                    aria-hidden="true"
                  >
                    <ImageIcon className="h-8 w-8 opacity-30" />
                    <span className="text-[10px] mt-1 text-slate-400">No image</span>
                  </div>

                  {/* Evidence status tag */}
                  <span className={`evidence-status-tag ${evStatus}`} aria-label={`Evidence status: ${evidenceStatusLabel(evStatus)}`}>
                    {evidenceStatusLabel(evStatus)}
                  </span>
                </div>

                {/* Card body */}
                <div className="p-4 flex flex-col gap-2 flex-1">
                  {/* Meta row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <StatusDot severity={report.severity} />
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${severityLabel(report.severity)}`}>
                        {report.severity}
                      </span>
                    </div>
                    <ReportStatusBadge status={report.status} />
                  </div>

                  {/* Metadata eyebrow + title */}
                  <div>
                    <div className="meta-eyebrow">REPORT ORIGIN</div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight mt-0.5">
                      {report.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1 line-clamp-2">
                      {report.description}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-sky-500" />
                        <span className="font-mono-numbers">{report.lat.toFixed(4)}, {report.lon.toFixed(4)}</span>
                      </div>
                      <span className="asset-id-badge">{formatReportId(report.id)}</span>
                    </div>
                    <div className="mt-1 text-[10px] capitalize text-slate-400">
                      Submitted by: {report.reporter_type}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <Link
                        href="/map"
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                      >
                        Open map →
                      </Link>
                      <Link
                        href="/work-orders"
                        className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      >
                        View work orders
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredReports.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-xs text-slate-500 dark:border-slate-700">
              {reports.length === 0 ? "No reports are available." : "No incident reports match this filter."}
            </p>
          )}
        </div>
      )}

      {/* Photo lightbox */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setExpandedPhoto(null)}
        >
          <div className="max-w-3xl w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExpandedPhoto(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm font-semibold"
              aria-label="Close photo"
            >
              Close ✕
            </button>
            <img
              src={expandedPhoto}
              alt="Evidence photograph"
              className="w-full max-h-[80vh] object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* Submit modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Drainage Incident</h3>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div>
              <label htmlFor="report-title" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Incident Title
              </label>
              <input
                id="report-title"
                type="text"
                required
                placeholder="e.g. Blocked culvert near Vasant Kunj Sector C"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1.5 w-full rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="report-desc" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Description
              </label>
              <textarea
                id="report-desc"
                rows={3}
                required
                placeholder="Observed water depth, silt obstruction, or floating debris…"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="mt-1.5 w-full rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="report-photo" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Evidence photo (optional, JPEG/PNG/WebP up to 10 MiB)
              </label>
              <input
                id="report-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setNewPhoto(event.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-sky-700 dark:text-slate-300 dark:file:bg-sky-950 dark:file:text-sky-300"
              />
              {newPhoto && <p className="mt-1 text-[11px] text-slate-500">{newPhoto.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="report-severity" className="font-medium text-slate-700 dark:text-slate-300">Severity</label>
                <select
                  id="report-severity"
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as "critical" | "high" | "medium")}
                  className="mt-1.5 w-full rounded border border-slate-200 bg-slate-50 p-2 font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="critical">Critical (&gt;20cm ponding)</option>
                  <option value="high">High (Inlet submerged)</option>
                  <option value="medium">Medium (Slow flow)</option>
                </select>
              </div>
              <div>
                <label htmlFor="report-lat" className="font-medium text-slate-700 dark:text-slate-300">Latitude</label>
                <div className="unit-input-wrap mt-1.5">
                  <input
                    id="report-lat"
                    type="text"
                    value={newLat}
                    onChange={(e) => setNewLat(e.target.value)}
                    className="unit-input"
                    placeholder="28.56"
                  />
                  <span className="unit-suffix">°N</span>
                </div>
              </div>
            </div>

            {submitError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="rounded border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
