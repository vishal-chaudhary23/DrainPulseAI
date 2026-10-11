"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Users,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { DrainAsset, MaintenanceTask, fetchAssets, fetchTasks, createTask } from "@/lib/api";

export default function WorkOrdersOperationsPage() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [assets, setAssets] = useState<DrainAsset[]>([]);
  const [selectedDrainId, setSelectedDrainId] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCrew, setNewTaskCrew] = useState("South Zone Rapid Response Unit");
  const [newTaskPriority, setNewTaskPriority] = useState<"critical" | "high" | "moderate">("high");
  const [newTaskDueHours, setNewTaskDueHours] = useState(6);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [taskData, assetData] = await Promise.all([fetchTasks(), fetchAssets()]);
        setTasks(taskData);
        setAssets(assetData);
        const requestedAssetId = Number(new URLSearchParams(window.location.search).get("asset_id"));
        const requestedAsset = assetData.find((asset) => asset.id === requestedAssetId);
        if (requestedAsset) {
          setSelectedDrainId(requestedAsset.id);
          setNewTaskTitle(`Inspect and clear ${requestedAsset.name}`);
          setShowCreateModal(true);
        } else if (assetData[0]) {
          setSelectedDrainId(assetData[0].id);
        }
      } catch (err) {
        console.error("Failed to load work order data:", err);
        setCreateError("Could not load assets or work orders. Refresh the page and try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      const created = await createTask({
        drain_id: selectedDrainId,
        title: newTaskTitle,
        crew: newTaskCrew,
        priority: newTaskPriority,
        due_hours: newTaskDueHours,
        status: "pending",
        notes: "Field dispatch order generated from operations desk.",
      });
      setTasks((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewTaskTitle("");
    } catch (err) {
      console.warn("Create task error:", err);
      setCreateError(err instanceof Error ? err.message : "Could not create the work order. Please retry.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <Wrench className="h-4 w-4" />
            <span>Remediation Management</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Maintenance Work Orders
          </h2>
          <p className="text-xs text-slate-500">
            Emergency desilting task assignments, SLA countdowns, and municipal crew dispatch tracking
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Dispatch New Task</span>
        </button>
      </div>

      {/* Task Summary Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Active Work Orders</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{tasks.length} Orders</div>
          <span className="text-[11px] text-slate-500">Across 3 municipal divisions</span>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 shadow-sm dark:border-red-950 dark:bg-red-950/30">
          <span className="text-red-700 dark:text-red-300 font-medium">Critical SLA (&lt;4h)</span>
          <div className="mt-1 text-2xl font-bold text-red-900 dark:text-red-200">
            {tasks.filter((t) => t.priority === "critical").length} Pending
          </div>
          <span className="text-[11px] text-red-600 dark:text-red-400">Immediate traffic cordon needed</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Crews in Field</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">6 Units</div>
          <span className="text-[11px] text-emerald-600">Suction & jetting rigs operational</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-slate-400">Resolution Rate</span>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">92.4%</div>
          <span className="text-[11px] text-slate-500">Within 24h storm recovery cycle</span>
        </div>
      </div>

      {/* Work Orders List */}
      {createError && !showCreateModal && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{createError}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-850">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Dispatched Work Orders Table
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-850 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Task ID & Scope</th>
                <th className="px-4 py-3">Assigned Crew</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Target SLA</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.length > 0 ? tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {task.title}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      WO #{task.id} · Linked Drain #{task.drain_id}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {task.crew}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        task.priority === "critical"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center font-medium text-slate-800 dark:text-slate-200">
                    <span className="flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {task.due_hours} Hours
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 uppercase dark:bg-slate-800 dark:text-slate-300">
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-500 max-w-xs truncate">
                    {task.notes}
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-500">{loading ? "Loading work orders…" : "No work orders are available."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Dispatch Maintenance Work Order
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close work order form"
              >
                ✕
              </button>
            </div>

            <div>
              <label htmlFor="task-asset" className="text-xs font-medium text-slate-700 dark:text-slate-300">Drain asset</label>
              <select
                id="task-asset"
                required
                value={selectedDrainId}
                onChange={(e) => setSelectedDrainId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.ward}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="task-title" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Work Order Description
              </label>
              <input
                id="task-title"
                type="text"
                required
                placeholder="e.g. Deploy mechanical excavator to clear inlet screen"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">
                  Priority
                </label>
                <select
                  aria-label="Work order priority"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="critical">Critical (&lt;4h)</option>
                  <option value="high">High (&lt;8h)</option>
                  <option value="moderate">Moderate (&lt;24h)</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">
                  SLA Window
                </label>
                <input
                  aria-label="SLA window in hours"
                  type="number"
                  min={1}
                  max={48}
                  value={newTaskDueHours}
                  onChange={(e) => setNewTaskDueHours(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="task-crew" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Assigned Unit
              </label>
              <select
                id="task-crew"
                value={newTaskCrew}
                onChange={(e) => setNewTaskCrew(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="South Division Rapid Response Unit">South Division Rapid Response Unit</option>
                <option value="North West Heavy Dredging Crew">North West Heavy Dredging Crew</option>
                <option value="East Zone Trans-Yamuna Taskforce">East Zone Trans-Yamuna Taskforce</option>
                <option value="Central Silt Evacuation Unit">Central Silt Evacuation Unit</option>
              </select>
            </div>

            {createError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{createError}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || assets.length === 0}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating…" : "Issue Order"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
