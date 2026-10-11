"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Box,
  Map as MapIcon,
  Droplets,
  AlertTriangle,
  CloudRain,
  Search,
  AlertOctagon,
} from "lucide-react";
import {
  DEMO_RAINFALL_CELLS,
  registerRiskHatchPattern,
  setBuildingExtrusionVisible,
  setupBuildingExtrusion,
} from "@/lib/mapEngine";
import { DrainAsset, IncidentReport } from "@/lib/api";
import {
  DELHI_DRAINAGE_NETWORK,
  DELHI_LOCALITIES,
  DELHI_MUNICIPAL_VIEW,
  INDIA_NATIONAL_VIEW,
  LocalityItem,
} from "@/lib/geoData";
import { useTheme } from "@/context/ThemeContext";

// ─── Worker config ───────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  try {
    (maplibregl as any).setWorkerUrl("/maplibre-gl-worker.mjs");
  } catch {
    // SSR safety
  }
}

// ─── Map styles ──────────────────────────────────────────────────────────────
const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

// ─── Delhi high-risk zone polygons (demo fixture, labelled as such) ──────────
const DELHI_RISK_ZONES: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "rz-barapullah-south",
      properties: {
        id: "rz-barapullah-south",
        name: "Barapullah Basin Critical Zone",
        risk_level: "critical",
        zone: "South Delhi",
        note: "DEMO FIXTURE — Synthetic boundary for illustration",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [77.195, 28.513], [77.235, 28.513], [77.265, 28.548],
          [77.272, 28.598], [77.250, 28.605], [77.215, 28.575],
          [77.185, 28.545], [77.175, 28.525], [77.195, 28.513],
        ]],
      },
    },
    {
      type: "Feature",
      id: "rz-lajpat-ring",
      properties: {
        id: "rz-lajpat-ring",
        name: "Lajpat Nagar Ring Road Flood Risk",
        risk_level: "high",
        zone: "South Delhi",
        note: "DEMO FIXTURE — Synthetic boundary for illustration",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [77.228, 28.558], [77.262, 28.558], [77.268, 28.578],
          [77.248, 28.582], [77.228, 28.575], [77.228, 28.558],
        ]],
      },
    },
    {
      type: "Feature",
      id: "rz-rohini-bowl",
      properties: {
        id: "rz-rohini-bowl",
        name: "Rohini Low-Lying Retention Zone",
        risk_level: "high",
        zone: "North West Delhi",
        note: "DEMO FIXTURE — Synthetic boundary for illustration",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [77.048, 28.730], [77.078, 28.730], [77.085, 28.750],
          [77.065, 28.758], [77.042, 28.748], [77.048, 28.730],
        ]],
      },
    },
  ],
};

interface DrainMapProps {
  assets: DrainAsset[];
  reports?: IncidentReport[];
  selectedAsset: DrainAsset | null;
  onSelectAsset: (asset: DrainAsset | null) => void;
  height?: string;
  isCompact?: boolean;
}

// ─── Format stable asset identifier ─────────────────────────────────────────
function formatAssetId(id: number): string {
  return `DP-DEL-${String(id).padStart(4, "0")}`;
}

export default function DrainMap({
  assets,
  reports = [],
  selectedAsset,
  onSelectAsset,
  height = "100%",
}: DrainMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const { theme } = useTheme();

  // ── State ─────────────────────────────────────────────────────────────────
  const [is3D, setIs3D] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [currentExtent, setCurrentExtent] = useState<"india" | "delhi">("delhi");

  // Layer toggles
  const [showTrunks, setShowTrunks] = useState(true);
  const [showAssets, setShowAssets] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showRiskBuffer, setShowRiskBuffer] = useState(true);
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [showRainfall, setShowRainfall] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [buildings3dAvailable, setBuildings3dAvailable] = useState(false);
  const [mapReloadKey, setMapReloadKey] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocalityItem[]>([]);

  // Telemetry HUD state
  const [cursorLat, setCursorLat] = useState<number | null>(null);
  const [cursorLon, setCursorLon] = useState<number | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(DELHI_MUNICIPAL_VIEW.zoom);
  const [fps, setFps] = useState<number | null>(null);
  const [dataStatus, setDataStatus] = useState<"loading" | "connected" | "fallback">("loading");
  const [lastRefresh, setLastRefresh] = useState<string>("");

  // FPS measurement
  const fpsRef = useRef<{ frames: number; lastTime: number; rafId: number }>({
    frames: 0,
    lastTime: 0,
    rafId: 0,
  });

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    const q = query.toLowerCase();
    setSearchResults(
      DELHI_LOCALITIES.filter(
        (l) => l.name.toLowerCase().includes(q) || l.zone.toLowerCase().includes(q)
      )
    );
  };

  const flyToLocality = (item: LocalityItem) => {
    if (!mapInstance.current) return;
    mapInstance.current.flyTo({
      center: item.coordinates,
      zoom: 14.5,
      pitch: is3D ? 50 : 0,
      duration: 1800,
    });
    setSearchQuery(item.name);
    setSearchResults([]);
  };

  // ── Extent controls ───────────────────────────────────────────────────────
  const handleFlyIndia = () => {
    if (!mapInstance.current) return;
    setCurrentExtent("india");
    mapInstance.current.flyTo({
      center: INDIA_NATIONAL_VIEW.center,
      zoom: INDIA_NATIONAL_VIEW.zoom,
      pitch: 0, bearing: 0, duration: 2200,
    });
  };

  const handleFlyDelhi = () => {
    if (!mapInstance.current) return;
    setCurrentExtent("delhi");
    mapInstance.current.flyTo({
      center: DELHI_MUNICIPAL_VIEW.center,
      zoom: DELHI_MUNICIPAL_VIEW.zoom,
      pitch: is3D ? 50 : 0,
      bearing: is3D ? -15 : 0,
      duration: 2000,
    });
  };

  // ── Dock actions ──────────────────────────────────────────────────────────
  const zoomIn = () => mapInstance.current?.zoomIn({ duration: 250 });
  const zoomOut = () => mapInstance.current?.zoomOut({ duration: 250 });

  const toggle3D = () => {
    if (!mapInstance.current) return;
    const next = !is3D;
    setIs3D(next);
    mapInstance.current.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 1200 });
    if (buildings3dAvailable) {
      setBuildingExtrusionVisible(mapInstance.current, next);
    }
  };

  const resetCamera = () => {
    if (!mapInstance.current) return;
    setIs3D(false);
    if (buildings3dAvailable) {
      setBuildingExtrusionVisible(mapInstance.current, false);
    }
    mapInstance.current.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  };

  const retryMap = () => {
    setMapError(null);
    setMapLoaded(false);
    setDataStatus("loading");
    setMapReloadKey((k) => k + 1);
  };

  // ── FPS loop ──────────────────────────────────────────────────────────────
  const startFpsMeasurement = useCallback(() => {
    const ref = fpsRef.current;
    ref.frames = 0;
    ref.lastTime = performance.now();

    const tick = () => {
      ref.frames++;
      const now = performance.now();
      const elapsed = now - ref.lastTime;
      if (elapsed >= 1000) {
        setFps(Math.round((ref.frames * 1000) / elapsed));
        ref.frames = 0;
        ref.lastTime = now;
      }
      ref.rafId = requestAnimationFrame(tick);
    };
    ref.rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.rafId);
  }, []);

  // ── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    setMapLoaded(false);
    setMapError(null);
    setDataStatus("loading");

    const activeStyle = theme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;
    let loadTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!mapInstance.current?.loaded()) {
        setMapError("Map tiles are taking longer than expected. Check network access to Carto basemaps.");
        setDataStatus("fallback");
      }
    }, 15000);

    let stopFps: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: activeStyle,
        center: DELHI_MUNICIPAL_VIEW.center,
        zoom: DELHI_MUNICIPAL_VIEW.zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
      });

      // Attribution only (no navigation control — we have our own dock)
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: "© OpenStreetMap contributors, CartoDB",
        }),
        "bottom-right"
      );

      // ── Cursor telemetry ─────────────────────────────────────────────────
      const onMouseMove = (e: maplibregl.MapMouseEvent) => {
        setCursorLat(e.lngLat.lat);
        setCursorLon(e.lngLat.lng);
      };
      const onMouseLeave = () => {
        setCursorLat(null);
        setCursorLon(null);
      };
      map.on("mousemove", onMouseMove);
      map.getCanvas().addEventListener("mouseleave", onMouseLeave);

      // ── Zoom telemetry ───────────────────────────────────────────────────
      map.on("zoom", () => setMapZoom(map.getZoom()));
      map.on("move", () => setMapZoom(map.getZoom()));

      // ── Layer setup on load ──────────────────────────────────────────────
      const setupLayers = () => {
        if (loadTimeout) {
          clearTimeout(loadTimeout);
          loadTimeout = null;
        }
        setMapLoaded(true);
        setMapError(null);
        setDataStatus("connected");
        setLastRefresh(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

        registerRiskHatchPattern(map);
        const hasBuildings = setupBuildingExtrusion(map, theme === "dark");
        setBuildings3dAvailable(hasBuildings);
        if (hasBuildings && is3D) {
          setBuildingExtrusionVisible(map, true);
        }

        // ── Risk zone polygons ──────────────────────────────────────────
        if (!map.getSource("risk-zones")) {
          map.addSource("risk-zones", { type: "geojson", data: DELHI_RISK_ZONES });

          // Translucent fill
          map.addLayer({
            id: "risk-zone-fill",
            type: "fill",
            source: "risk-zones",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "risk_level"], "critical"], "rgba(220, 38, 38, 0.12)",
                "rgba(234, 88, 12, 0.10)",
              ],
              "fill-opacity": 1,
            },
          });

          map.addLayer({
            id: "risk-zone-hatch",
            type: "fill",
            source: "risk-zones",
            paint: {
              "fill-pattern": "risk-hatch-pattern",
              "fill-opacity": 0.35,
            },
          });

          // Boundary stroke
          map.addLayer({
            id: "risk-zone-border",
            type: "line",
            source: "risk-zones",
            paint: {
              "line-color": [
                "case",
                ["==", ["get", "risk_level"], "critical"], "#dc2626",
                "#ea580c",
              ],
              "line-width": 1.5,
              "line-opacity": 0.75,
              "line-dasharray": [3, 2],
            },
          });
        }

        if (!map.getSource("rainfall-demo")) {
          map.addSource("rainfall-demo", { type: "geojson", data: DEMO_RAINFALL_CELLS });
          map.addLayer({
            id: "rainfall-demo-fill",
            type: "fill",
            source: "rainfall-demo",
            layout: { visibility: "none" },
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "intensity_mm_h"],
                20,
                "#bae6fd",
                50,
                "#0ea5e9",
                80,
                "#0369a1",
              ],
              "fill-opacity": 0.45,
            },
          });
          map.addLayer({
            id: "rainfall-demo-outline",
            type: "line",
            source: "rainfall-demo",
            layout: { visibility: "none" },
            paint: {
              "line-color": "#0284c7",
              "line-width": 1,
              "line-opacity": 0.6,
            },
          });
        }

        // ── Drainage network ────────────────────────────────────────────
        if (!map.getSource("delhi-drainage")) {
          map.addSource("delhi-drainage", { type: "geojson", data: DELHI_DRAINAGE_NETWORK });

          // Risk glow
          map.addLayer({
            id: "drain-risk-glow",
            type: "line",
            source: "delhi-drainage",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": ["case", [">=", ["get", "risk"], 75], "#ef4444", [">=", ["get", "risk"], 60], "#f97316", "#0d9488"],
              "line-width": 10,
              "line-opacity": 0.2,
            },
          });

          // Core drain line
          map.addLayer({
            id: "drain-trunk-lines",
            type: "line",
            source: "delhi-drainage",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": ["case", [">=", ["get", "risk"], 75], "#dc2626", [">=", ["get", "risk"], 60], "#ea580c", "#0f766e"],
              "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 14, 5, 16, 8],
              "line-opacity": 0.9,
            },
          });

          // Drain line click
          map.on("click", "drain-trunk-lines", (e) => {
            if (e.features?.[0]?.properties) {
              const props = e.features[0].properties;
              const matched = assets.find((a) => a.name.toLowerCase().includes(props.name?.split(" ")[0]?.toLowerCase() ?? "")) || assets[0];
              if (matched) onSelectAsset(matched);
            }
          });

          map.on("mouseenter", "drain-trunk-lines", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "drain-trunk-lines", () => { map.getCanvas().style.cursor = ""; });
        }

        // Start FPS measurement
        stopFps = startFpsMeasurement();
      };

      map.on("load", setupLayers);
      if (map.loaded()) setupLayers();

      map.on("error", (e) => {
        console.warn("MapLibre error:", e);
        const msg = (e as { error?: { message?: string } }).error?.message;
        if (msg?.includes("Failed to fetch") || msg?.includes("tile")) {
          setMapError("Basemap tiles failed to load. Verify network access and retry.");
          setDataStatus("fallback");
        }
      });

      mapInstance.current = map;

      if (mapContainer.current) {
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserver.observe(mapContainer.current);
      }
    } catch (err) {
      console.error("Map init failed:", err);
      setMapError("Failed to initialise map engine. Check internet connection.");
    }

    return () => {
      if (loadTimeout) clearTimeout(loadTimeout);
      resizeObserver?.disconnect();
      stopFps?.();
      if (fpsRef.current.rafId) cancelAnimationFrame(fpsRef.current.rafId);
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, mapReloadKey]);

  // ── Update markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (showAssets) {
      assets.forEach((asset) => {
        const isSelected = selectedAsset?.id === asset.id;
        const risk = asset.risk ?? 60;
        const color = risk >= 75 ? "#dc2626" : risk >= 58 ? "#ea580c" : risk >= 45 ? "#d97706" : "#16a34a";
        const size = isSelected ? 34 : risk >= 75 ? 27 : 22;

        const el = document.createElement("div");
        el.setAttribute("title", `${asset.name} · Risk ${Math.round(risk)}`);
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", `Select ${asset.name}, risk ${Math.round(risk)}`);
        el.style.cssText = `cursor:pointer;display:flex;align-items:center;justify-content:center;`;
        el.innerHTML = `
          <div style="
            position:relative;display:flex;align-items:center;justify-content:center;
            width:${size}px;height:${size}px;
            background:${color};border:${isSelected ? "3px" : "2px"} solid #fff;
            border-radius:9999px;box-shadow:${risk >= 75 ? "0 0 0 3px rgba(220,38,38,0.18)," : ""}0 2px 8px rgba(15,23,42,0.32);
            transition:transform 0.15s;
          ">
            <span style="color:#fff;font-size:9px;font-weight:700;font-family:monospace;font-feature-settings:'tnum';">
              ${Math.round(risk)}
            </span>
            ${isSelected ? `<div style="position:absolute;inset:-5px;border:2px solid ${color};border-radius:9999px;opacity:0.5;"></div>` : ""}
          </div>
        `;

        el.onclick = () => {
          onSelectAsset(asset);
          map.flyTo({ center: [asset.lon, asset.lat], zoom: Math.max(map.getZoom(), 13), duration: 900 });
        };
        el.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            el.click();
          }
        };

        markersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([asset.lon, asset.lat]).addTo(map)
        );
      });
    }

    if (showIncidents) {
      reports.forEach((report) => {
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;";
        el.innerHTML = `
          <div style="
            display:flex;align-items:center;justify-content:center;
            width:18px;height:18px;
            background:#ef4444;border:2px solid #fff;
            border-radius:3px;transform:rotate(45deg);
            box-shadow:0 2px 6px rgba(239,68,68,0.45);
          "><div style="width:5px;height:5px;background:#fff;border-radius:9999px;"></div></div>
        `;

        const popup = new maplibregl.Popup({ offset: 14 }).setHTML(`
          <div style="font-size:12px;font-family:inherit;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:3px;">${report.title}</div>
            <div style="color:#64748b;font-size:11px;">${report.description}</div>
            <div style="margin-top:5px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;">
              ${report.reporter_type} · ${report.status.replace("_", " ")}
            </div>
          </div>
        `);

        markersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([report.lon, report.lat]).setPopup(popup).addTo(map)
        );
      });
    }
  }, [assets, reports, selectedAsset, showAssets, showIncidents]);

  // ── Layer visibility sync ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded) return;

    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    };

    setVis("drain-trunk-lines", showTrunks);
    setVis("drain-risk-glow", showTrunks && showRiskBuffer);
    setVis("risk-zone-fill", showRiskZones);
    setVis("risk-zone-hatch", showRiskZones);
    setVis("risk-zone-border", showRiskZones);
    setVis("rainfall-demo-fill", showRainfall);
    setVis("rainfall-demo-outline", showRainfall);
  }, [showTrunks, showRiskBuffer, showRiskZones, showRainfall, mapLoaded]);

  // ── Telemetry formatting ──────────────────────────────────────────────────
  const fmtCoord = (v: number, isLat: boolean) => {
    const dir = isLat ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
    return `${Math.abs(v).toFixed(4)}° ${dir}`;
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--card-shadow)] ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/5"
      style={{ height }}
    >
      {/* Map viewport */}
      <div ref={mapContainer} className="h-full w-full" />

      {/* Loading overlay */}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/85 backdrop-blur-sm dark:bg-slate-900/85 z-20">
          <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-4 py-2.5 shadow-md dark:border-slate-700 dark:bg-slate-800">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Loading cartography…</span>
          </div>
        </div>
      )}

      {/* Error banner */}
      {mapError && (
        <div className="absolute top-3 left-3 right-3 z-30 rounded border border-red-200 bg-red-50 p-3 text-red-800 shadow dark:border-red-900/50 dark:bg-red-950/70 dark:text-red-300">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold">Map service disruption</p>
                <p className="text-[11px]">{mapError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={retryMap}
              className="shrink-0 rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Top bar: extent selector + search ── */}
      <div className="map-toolbar absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
        {/* Extent selector */}
        <div className="flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-white/95 shadow-[var(--card-shadow)] dark:bg-slate-900/95">
          <button
            type="button"
            onClick={handleFlyIndia}
            title="View India national extent"
            className={`px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)] ${
              currentExtent === "india"
                ? "bg-slate-900 text-white dark:bg-sky-600"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            India
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
          <button
            type="button"
            onClick={handleFlyDelhi}
            title="View Delhi NCT basin"
            className={`px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)] ${
              currentExtent === "delhi"
                ? "bg-sky-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Delhi NCT
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <div className="map-search flex items-center rounded-lg border border-[var(--border)] bg-white/95 px-2.5 py-2 shadow-[var(--card-shadow)] dark:bg-slate-900/95">
            <Search className="h-3 w-3 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search locality…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-40 bg-transparent px-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus-visible:ring-0 dark:text-slate-100"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--elevated-shadow)]">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => flyToLocality(item)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[10px] text-slate-400">{item.zone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right side: segmented map control dock ── */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        {/* Main control dock */}
        <div className="map-ctrl-dock" role="group" aria-label="Map controls">
          <button
            type="button"
            className="map-ctrl-btn"
            onClick={zoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className="map-ctrl-btn"
            onClick={zoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className={`map-ctrl-btn ${is3D ? "active" : ""}`}
            onClick={toggle3D}
            title={is3D ? "Switch to 2D view" : "Switch to 3D perspective"}
            aria-label={is3D ? "2D view" : "3D perspective"}
            aria-pressed={is3D}
          >
            {is3D ? <Box className="h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className="map-ctrl-btn"
            onClick={resetCamera}
            title="Reset camera orientation"
            aria-label="Reset camera"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          {/* Layer group toggles */}
          <button
            type="button"
            className={`map-ctrl-btn ${showTrunks ? "active" : ""}`}
            onClick={() => setShowTrunks(!showTrunks)}
            title={`${showTrunks ? "Hide" : "Show"} drainage trunk lines`}
            aria-label="Toggle trunk lines"
            aria-pressed={showTrunks}
          >
            <Droplets className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className={`map-ctrl-btn ${showRiskZones ? "active" : ""}`}
            onClick={() => setShowRiskZones(!showRiskZones)}
            title={`${showRiskZones ? "Hide" : "Show"} risk zone boundaries`}
            aria-label="Toggle risk zones"
            aria-pressed={showRiskZones}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className={`map-ctrl-btn ${showIncidents ? "active" : ""}`}
            onClick={() => setShowIncidents(!showIncidents)}
            title={`${showIncidents ? "Hide" : "Show"} citizen incidents`}
            aria-label="Toggle incidents"
            aria-pressed={showIncidents}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className={`map-ctrl-btn ${showRainfall ? "active" : ""}`}
            onClick={() => setShowRainfall(!showRainfall)}
            title={`${showRainfall ? "Hide" : "Show"} demo rainfall cells (not verified radar)`}
            aria-label="Toggle rainfall overlay"
            aria-pressed={showRainfall}
          >
            <CloudRain className="h-3.5 w-3.5" />
          </button>

          <div className="map-ctrl-divider" />

          <button
            type="button"
            className={`map-ctrl-btn ${showLayerPanel ? "active" : ""}`}
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            title="Open layer management panel"
            aria-label="Layer management"
            aria-expanded={showLayerPanel}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Layer management panel */}
        {showLayerPanel && (
          <div className="map-layer-panel w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--elevated-shadow)]">
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Layer Controls
              </span>
              <button
                type="button"
                onClick={() => setShowLayerPanel(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                aria-label="Close layer panel"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { label: "Trunk Nullahs", icon: "─", state: showTrunks, set: setShowTrunks, color: "bg-sky-600" },
                { label: "Telemetry Nodes", icon: "●", state: showAssets, set: setShowAssets, color: "bg-red-600" },
                { label: "Risk Glow Buffer", icon: "≈", state: showRiskBuffer, set: setShowRiskBuffer, color: "bg-orange-400" },
                { label: "Risk Zone Bounds", icon: "▨", state: showRiskZones, set: setShowRiskZones, color: "bg-red-700" },
                { label: "Citizen Incidents", icon: "◆", state: showIncidents, set: setShowIncidents, color: "bg-red-500" },
                { label: "Rainfall (demo)", icon: "≋", state: showRainfall, set: setShowRainfall, color: "bg-sky-500" },
              ].map(({ label, state, set, color }) => (
                <label key={label} className="flex cursor-pointer items-center justify-between text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-3.5 rounded-sm ${color} opacity-80`} />
                    {label}
                  </span>
                  <input
                    type="checkbox"
                    checked={state}
                    onChange={(e) => set(e.target.checked)}
                    className="accent-sky-600 rounded"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-700">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Risk Zone Legend</div>
              <div className="flex items-center gap-2">
                <div className="risk-zone-legend-stripe" aria-hidden="true" />
                <span className="text-[10px] text-slate-500">DEMO fixture boundaries</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Telemetry HUD (bottom-left) ── */}
      <div className="map-telemetry absolute bottom-8 left-3 z-20 telemetry-hud" role="complementary" aria-label="Map telemetry">
        {/* Cursor position */}
        <div className="telemetry-row">
          <span className="telemetry-label">LAT</span>
          <span className="telemetry-value">
            {cursorLat !== null ? fmtCoord(cursorLat, true) : "— move cursor —"}
          </span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">LON</span>
          <span className="telemetry-value">
            {cursorLon !== null ? fmtCoord(cursorLon, false) : "—"}
          </span>
        </div>

        <div className="telemetry-sep" />

        {/* Map state */}
        <div className="telemetry-row">
          <span className="telemetry-label">ZOOM</span>
          <span className="telemetry-value">{mapZoom.toFixed(2)}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">VIEW</span>
          <span className="telemetry-value">{currentExtent === "india" ? "India" : "Delhi NCT"}</span>
        </div>

        <div className="telemetry-sep" />

        {/* FPS */}
        <div className="telemetry-row">
          <span className="telemetry-label">FPS</span>
          <span className="telemetry-value">
            {fps !== null ? fps : "—"}
          </span>
        </div>

        <div className="telemetry-sep" />

        {/* Data status */}
        <div className="telemetry-row">
          <span className="telemetry-label">DATA</span>
          <span className={`telemetry-value ${dataStatus === "connected" ? "connected" : dataStatus === "fallback" ? "warn" : ""}`}>
            {dataStatus === "connected" ? "LIVE" : dataStatus === "fallback" ? "CACHE" : "LOADING"}
          </span>
        </div>
        {lastRefresh && (
          <div className="telemetry-row">
            <span className="telemetry-label">SYNC</span>
            <span className="telemetry-value">{lastRefresh}</span>
          </div>
        )}
      </div>

      {/* ── Selected asset drawer (bottom, not obscuring HUD) ── */}
      {selectedAsset && (
        <div className="map-selected-panel absolute bottom-3 left-3 right-3 z-30 max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-[var(--elevated-shadow)] sm:left-[230px] sm:right-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    selectedAsset.priority === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : selectedAsset.priority === "high"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}
                >
                  {selectedAsset.priority}
                </span>
                <span className="asset-id-badge">{formatAssetId(selectedAsset.id)}</span>
              </div>
              <div className="meta-label mt-1.5">Drain asset</div>
              <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                {selectedAsset.name}
              </h3>
              <p className="text-[11px] text-slate-500">{selectedAsset.ward} · {selectedAsset.zone}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectAsset(null)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[var(--primary)] dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close asset panel"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-4 divide-x divide-[var(--border)] border-y border-[var(--border)] py-2 text-center text-xs">
            {[
              { label: "Risk", value: selectedAsset.risk ?? 60, color: "text-red-600 dark:text-red-400" },
              { label: "Blockage", value: `${selectedAsset.blockage}%`, color: "text-slate-800 dark:text-slate-100" },
              { label: "Silt", value: `${selectedAsset.silt}%`, color: "text-slate-800 dark:text-slate-100" },
              { label: "Capacity", value: `${selectedAsset.capacity}%`, color: "text-slate-800 dark:text-slate-100" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-[9px] font-medium text-[var(--muted)]">{label}</div>
                <div className={`text-sm font-bold font-mono-numbers ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
            <span>Last inspection: {selectedAsset.last_inspection}</span>
            <span>Conf: {((selectedAsset.confidence || 0.85) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* ── Legend (bottom-right, above attribution) ── */}
      <div className="map-legend absolute bottom-8 right-3 z-20 hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[10px] shadow-[var(--card-shadow)] sm:block">
      <div className="mb-1 font-semibold text-[var(--muted)] text-[9px] uppercase tracking-wider">Asset risk</div>
        {[
          { color: "bg-red-600", label: "Critical ≥75" },
          { color: "bg-orange-500", label: "High 58–74" },
          { color: "bg-amber-500", label: "Mod 45–57" },
          { color: "bg-emerald-600", label: "Low <45" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 leading-5">
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${color}`} />
            <span className="text-slate-600 dark:text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
