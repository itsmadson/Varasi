"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/LocaleProvider";

type Mode = "rect" | "poly";
type LngLat = [number, number];

function darkStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© CARTO © OpenStreetMap",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function ring(points: LngLat[], mode: Mode): LngLat[] | null {
  if (mode === "rect" && points.length === 2) {
    const [a, b] = points;
    return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]];
  }
  if (mode === "poly" && points.length >= 3) {
    return [...points, points[0]];
  }
  return null;
}

// DrawMap lets the user draw a bbox or polygon by clicking on the map and
// reports the resulting GeoJSON Polygon geometry (EPSG:4326) via onGeometry.
export function DrawMap({
  onGeometry,
  className,
}: {
  onGeometry: (geom: GeoJSON.Polygon | null) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pts = useRef<LngLat[]>([]);
  const modeRef = useRef<Mode>("rect");
  const [mode, setMode] = useState<Mode>("rect");
  const [count, setCount] = useState(0);

  const emit = () => {
    const r = ring(pts.current, modeRef.current);
    onGeometry(r ? { type: "Polygon", coordinates: [r] } : null);
  };

  const redraw = () => {
    const m = map.current;
    if (!m || !m.getSource("draw")) return;
    const features: GeoJSON.Feature[] = pts.current.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p },
      properties: {},
    }));
    const r = ring(pts.current, modeRef.current);
    if (r) {
      features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [r] }, properties: {} });
    } else if (pts.current.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: pts.current },
        properties: {},
      });
    }
    (m.getSource("draw") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
    setCount(pts.current.length);
  };

  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: darkStyle(),
      center: [51.4, 35.7],
      zoom: 8,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "draw-fill", type: "fill", source: "draw", filter: ["==", "$type", "Polygon"], paint: { "fill-color": "#a8ae79", "fill-opacity": 0.25 } });
      m.addLayer({ id: "draw-line", type: "line", source: "draw", filter: ["!=", "$type", "Point"], paint: { "line-color": "#a8ae79", "line-width": 2 } });
      m.addLayer({ id: "draw-pts", type: "circle", source: "draw", filter: ["==", "$type", "Point"], paint: { "circle-radius": 4, "circle-color": "#e8eada", "circle-stroke-color": "#8c9258", "circle-stroke-width": 2 } });
    });

    m.on("click", (e) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (modeRef.current === "rect") {
        if (pts.current.length >= 2) pts.current = [];
        pts.current.push(p);
      } else {
        pts.current.push(p);
      }
      redraw();
      emit();
    });
    m.on("dblclick", (e) => {
      if (modeRef.current === "poly") {
        e.preventDefault();
        emit();
      }
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDrawMode = (mo: Mode) => {
    modeRef.current = mo;
    setMode(mo);
    pts.current = [];
    redraw();
    emit();
  };
  const clear = () => {
    pts.current = [];
    redraw();
    emit();
  };

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <div className="glass absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg p-1.5">
        {(["rect", "poly"] as const).map((mo) => (
          <button
            key={mo}
            onClick={() => setDrawMode(mo)}
            className="chip"
            style={{
              color: mode === mo ? "var(--bg)" : "var(--muted)",
              background: mode === mo ? "var(--accent)" : "transparent",
              borderColor: mode === mo ? "var(--accent)" : "var(--border)",
            }}
          >
            {mo === "rect" ? t("wa.drawRect") : t("wa.drawPoly")}
          </button>
        ))}
        <button className="chip" onClick={clear}>
          {t("wa.clear")}
        </button>
      </div>
      <div className="glass absolute bottom-3 left-3 z-10 rounded-md px-2.5 py-1.5">
        <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
          {t("wa.drawHint")} · {count} pts
        </span>
      </div>
    </div>
  );
}
