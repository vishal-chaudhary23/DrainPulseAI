"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  GitFork,
  CloudRain,
  Flame,
  ClipboardCheck,
  Wrench,
  AlertOctagon,
  BarChart3,
  Database,
  Settings,
  Sun,
  Moon,
  Bell,
  Search,
  Menu,
  X,
  ChevronDown,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { DrainAsset, IncidentReport, fetchAssets, fetchReports } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeTone?: "red" | "amber" | "blue";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/map", label: "GIS Map", icon: MapPin },
  { href: "/network", label: "Network Explorer", icon: GitFork },
  { href: "/predictions", label: "Predictions", icon: Flame, badge: "2 Hotspots", badgeTone: "red" },
  { href: "/simulator", label: "Rain Simulator", icon: CloudRain },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck },
  { href: "/work-orders", label: "Work Orders", icon: Wrench, badge: "3 Open", badgeTone: "amber" },
  { href: "/reports", label: "Citizen Reports", icon: AlertOctagon },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/data-sources", label: "Data Sources", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchAssets, setSearchAssets] = useState<DrainAsset[]>([]);
  const [searchReports, setSearchReports] = useState<IncidentReport[]>([]);
  const [searchDataLoaded, setSearchDataLoaded] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetchAssets(), fetchReports()])
      .then(([assets, reports]) => {
        setSearchAssets(assets);
        setSearchReports(reports);
        setSearchDataLoaded(true);
      })
      .catch((err) => {
        console.error("Global search data could not be loaded:", err);
        setSearchDataLoaded(true);
      });
  }, []);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchedAssets = normalizedSearch
    ? searchAssets.filter((asset) =>
        `${asset.name} ${asset.ward} ${asset.zone} DP-DEL-${String(asset.id).padStart(4, "0")}`
          .toLowerCase()
          .includes(normalizedSearch)
      ).slice(0, 4)
    : [];
  const matchedReports = normalizedSearch
    ? searchReports.filter((report) =>
        `${report.title} ${report.description} DP-REP-${String(report.id).padStart(4, "0")}`
          .toLowerCase()
          .includes(normalizedSearch)
      ).slice(0, 3)
    : [];

  const searchResults = (mobile = false) => normalizedSearch ? (
    <div className={`search-results absolute z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--elevated-shadow)] ${mobile ? "left-0 right-0 top-full" : "left-0 right-0 top-full"}`}>
      {matchedAssets.map((asset) => (
        <Link
          key={`asset-${asset.id}`}
          href={`/network?asset_id=${asset.id}&search=${encodeURIComponent(searchQuery)}`}
          onClick={() => {
            setSearchQuery("");
            setMobileSearchOpen(false);
          }}
          className="block rounded-lg px-3 py-2 transition hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        >
          <span className="block truncate text-xs font-semibold text-[var(--foreground)]">{asset.name}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">Drain · {asset.ward} · DP-DEL-{String(asset.id).padStart(4, "0")}</span>
        </Link>
      ))}
      {matchedReports.map((report) => (
        <Link
          key={`report-${report.id}`}
          href={`/reports?report_id=${report.id}&search=${encodeURIComponent(searchQuery)}`}
          onClick={() => {
            setSearchQuery("");
            setMobileSearchOpen(false);
          }}
          className="block rounded-lg px-3 py-2 transition hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        >
          <span className="block truncate text-xs font-semibold text-[var(--foreground)]">{report.title}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">Incident · {report.status.replace("_", " ")} · DP-REP-{String(report.id).padStart(4, "0")}</span>
        </Link>
      ))}
      {searchDataLoaded && matchedAssets.length === 0 && matchedReports.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No drains or reports match “{searchQuery}”.</p>
      )}
      {!searchDataLoaded && <p role="status" className="px-3 py-4 text-center text-xs text-[var(--muted)]">Loading searchable records…</p>}
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Desktop Sidebar — compact engineering nav */}
      <aside className="hidden w-[13.5rem] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] dark:border-[var(--border)] lg:flex">
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--primary)] text-white shadow-sm">
              <CloudRain className="h-4 w-4" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight">
                DrainPulse<span className="text-[var(--primary)]">AI</span>
              </span>
              <span className="block text-[10px] text-[var(--muted)]">
                Delhi drainage intelligence
              </span>
            </div>
          </Link>
        </div>

        {/* Municipality / Tenant Info Pill */}
        <div className="mx-4 mt-3 mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span className="font-medium">Delhi NCT (MCD & DJB)</span>
          </div>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Telemetry Live" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 text-xs font-medium">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center justify-between rounded-lg px-3 py-2 transition ${
                  isActive
                    ? "bg-[var(--primary-light)] text-[var(--primary-text)] font-semibold dark:bg-teal-950/50 dark:text-teal-300"
                    : "text-slate-600 hover:bg-[var(--surface-hover)] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 transition ${
                      isActive
                        ? "text-[var(--primary)] dark:text-teal-400"
                        : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      item.badgeTone === "red"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        : item.badgeTone === "amber"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer: System Status */}
        <div className="border-t border-slate-200 p-3.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Sensor Health
            </span>
            <span className="font-semibold text-emerald-600">99.4%</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Delhi Monsoon Ready Engine v1.4
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-5">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Breadcrumb / Current View title */}
            <div className="hidden sm:block">
              <h1 className="font-heading text-sm font-semibold text-[var(--foreground)]">
                {NAV_ITEMS.find((i) => i.href === pathname)?.label || "Urban Drainage Operations"}
              </h1>
              <p className="text-[11px] text-[var(--muted)]">
                Delhi NCT · observe → simulate → intervene
              </p>
            </div>
          </div>

          <div className="relative mx-4 hidden max-w-md flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-1.5 md:flex">
            <Search className="h-3.5 w-3.5 text-[var(--muted)]" />
            <input
              type="search"
              placeholder="Search drains, wards, asset IDs…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full bg-transparent text-xs text-[var(--foreground)] placeholder:text-[var(--muted-light)] outline-none"
              aria-label="Global geographic search"
              aria-expanded={Boolean(normalizedSearch)}
              aria-controls="global-search-results"
            />
            {normalizedSearch && <div id="global-search-results">{searchResults()}</div>}
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 md:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              aria-expanded={mobileSearchOpen}
            >
              {mobileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "light" ? "Dark" : "Light"} theme`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>

            {/* User Profile / Role Badge */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">
                OL
              </div>
              <div className="hidden text-left text-xs md:block">
                <span className="block font-medium text-slate-800 dark:text-slate-200">
                  Operations Lead
                </span>
                <span className="block text-[10px] text-slate-400">admin · MCD</span>
              </div>
            </div>
          </div>
        </header>

        {mobileSearchOpen && (
          <div className="relative z-40 border-b border-[var(--border)] bg-[var(--surface)] p-3 md:hidden">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              <input
                type="search"
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search drains, wards, reports…"
                aria-label="Search drains, wards, and reports"
                aria-expanded={Boolean(normalizedSearch)}
                className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-light)]"
              />
            </div>
            {searchResults(true)}
          </div>
        )}

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 z-50 flex flex-col bg-white p-4 shadow-2xl dark:bg-slate-900 lg:hidden">
            <nav className="space-y-1 text-sm font-medium">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                      isActive
                        ? "bg-sky-50 text-sky-700 font-semibold dark:bg-sky-950 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
