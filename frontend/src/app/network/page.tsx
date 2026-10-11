"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  GitFork,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Droplets,
  Wrench,
  ClipboardCheck,
  ExternalLink,
} from "lucide-react";
import { DrainAsset, fetchAssets } from "@/lib/api";

export default function NetworkExplorerPage() {
  const [assets, setAssets] = useState<DrainAsset[]>([]);
  const [search, setSearch] = useState("");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<DrainAsset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAssets();
        setAssets(data);
        const params = new URLSearchParams(window.location.search);
        const query = params.get("search") ?? "";
        const requestedAssetId = Number(params.get("asset_id"));
        if (query) setSearch(query);
        const requestedAsset = data.find((asset) => asset.id === requestedAssetId);
        if (requestedAsset) setSelectedAsset(requestedAsset);
      } catch (err) {
        console.error("Failed to load network assets:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const matchSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.ward.toLowerCase().includes(search.toLowerCase()) ||
        a.zone.toLowerCase().includes(search.toLowerCase()) ||
        `dp-del-${String(a.id).padStart(4, "0")}`.includes(search.toLowerCase());
      const matchZone = selectedZone === "all" || a.zone === selectedZone;
      const matchStatus = selectedStatus === "all" || a.status === selectedStatus;
      return matchSearch && matchZone && matchStatus;
    });
  }, [assets, search, selectedZone, selectedStatus]);

  const zones = useMemo(() => {
    return Array.from(new Set(assets.map((a) => a.zone)));
  }, [assets]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Title & Network Telemetry Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            <GitFork className="h-4 w-4" />
            <span>Infrastructure Inventory</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Drainage Network Explorer
          </h2>
          <p className="text-xs text-slate-500">
            Delhi NCT arterial drains, stormwater collectors, outfall sluices, and culvert cross-sections
          </p>
        </div>

        <Link
          href="/map"
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition"
        >
          View on 3D GIS Map <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Network Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Total Network Nodes</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">428 Nodes</div>
          <span className="text-[11px] text-emerald-600">100% GIS geo-referenced</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Arterial Channel Length</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">110.4 km</div>
          <span className="text-[11px] text-slate-500">Yamuna & Najafgarh Basins</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">High Risk Surcharges</span>
          <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">5 Arteries</div>
          <span className="text-[11px] text-red-500">Silt depth &gt;50% capacity</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Avg Inspection Recency</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">4.8 Days</div>
          <span className="text-[11px] text-slate-500">Routine shift verification</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800 sm:max-w-xs">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search drain name, ward, or zone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Operational Statuses</option>
            <option value="monitor">Routine Monitor</option>
            <option value="inspection">Under Inspection</option>
            <option value="priority">Priority Desilting</option>
            <option value="cleared">Cleared</option>
          </select>
        </div>
      </div>

      {/* Asset Inventory Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-850 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Asset ID & Name</th>
                <th className="px-4 py-3">Zone & Ward</th>
                <th className="px-4 py-3 text-center">Blockage</th>
                <th className="px-4 py-3 text-center">Silt Surcharge</th>
                <th className="px-4 py-3 text-center">Capacity</th>
                <th className="px-4 py-3 text-center">Risk Index</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((asset) => (
                <tr
                  key={asset.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                >
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {asset.name}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      ID #{asset.id} · Lat {asset.lat.toFixed(4)}, Lon {asset.lon.toFixed(4)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {asset.zone}
                    </span>
                    <span className="block text-[11px] text-slate-400">{asset.ward}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-slate-200">
                    {asset.blockage}%
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-slate-200">
                    {asset.silt}%
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-slate-200">
                    {asset.capacity}%
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">
                      {asset.risk ?? 60}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        asset.priority === "critical"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : asset.priority === "high"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {asset.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase dark:bg-slate-800 dark:text-slate-300">
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedAsset(asset)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:border-slate-700 dark:text-sky-400 dark:hover:bg-slate-800"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Asset Detail Inspection Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    selectedAsset.priority === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                  }`}
                >
                  {selectedAsset.priority}
                </span>
                <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                  {selectedAsset.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedAsset.ward} · {selectedAsset.zone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="my-4 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs dark:bg-slate-800">
              <div>
                <span className="text-[10px] text-slate-400">Risk Score</span>
                <div className="text-lg font-bold text-red-600 dark:text-red-400">
                  {selectedAsset.risk ?? 60}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Blockage</span>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {selectedAsset.blockage}%
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Silt Surcharge</span>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {selectedAsset.silt}%
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Design Capacity</span>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {selectedAsset.capacity}%
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p>
                <strong className="text-slate-900 dark:text-white">Inspection Notes: </strong>
                {selectedAsset.notes}
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">Engineering Action: </strong>
                {selectedAsset.recommendation || "Desilting crew allocation recommended."}
              </p>
              <p className="text-[11px] text-slate-400">
                Last Verified Inspection: {selectedAsset.last_inspection} · Confidence:{" "}
                {((selectedAsset.confidence || 0.85) * 100).toFixed(0)}%
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Link
                href="/inspections"
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition"
              >
                Launch Field Inspection
              </Link>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
