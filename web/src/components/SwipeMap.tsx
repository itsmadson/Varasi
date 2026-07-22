"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import type { GeoJSONFC } from "@/lib/api";

type Item = { collection: string; id: string };

const CLASS_COLORS: (string | string[])[] = [
  "match",
  ["get", "change_class"],
  "urban_growth", "#c46a5a",
  "vegetation_loss", "#cb9a54",
  "vegetation_gain", "#8c9258",
  "water_change", "#5a8fc4",
  "bare_soil", "#b7bd90",
  "#a8ae79",
];

function baseStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], tileSize: 256 },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function tileURL(item: Item) {
  return (
    `${location.origin}/catalog/raster/collections/${item.collection}/items/${item.id}` +
    `/tiles/WebMercatorQuad/{z}/{x}/{y}.png?assets=data`
  );
}

function addItemRaster(m: maplibregl.Map, item: Item) {
  if (m.getLayer("item")) m.removeLayer("item");
  if (m.getSource("item")) m.removeSource("item");
  m.addSource("item", { type: "raster", tiles: [tileURL(item)], tileSize: 256 });
  m.addLayer({ id: "item", type: "raster", source: "item" });
}

/**
 * SwipeMap compares two dated scenes with a draggable divider. The "before"
 * scene sits on top, clipped to the left of the handle; dragging reveals the
 * "after" scene beneath. Detected change polygons overlay the after map.
 */
export function SwipeMap({
  before,
  after,
  detections,
  className,
}: {
  before: Item;
  after: Item;
  detections?: GeoJSONFC;
  className?: string;
}) {
  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const topWrap = useRef<HTMLDivElement>(null);
  const mB = useRef<maplibregl.Map | null>(null);
  const mA = useRef<maplibregl.Map | null>(null);
  const [pos, setPos] = useState(50); // divider %, from left
  const dragging = useRef(false);

  const transformRequest = (url: string) => {
    if (url.startsWith(location.origin + "/catalog")) {
      const token = getToken();
      return { url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
    }
    return { url };
  };

  useEffect(() => {
    if (!beforeRef.current || !afterRef.current || mA.current) return;
    const common = { center: [51.41, 35.72] as [number, number], zoom: 10, attributionControl: false as const, transformRequest };

    const afterMap = new maplibregl.Map({ container: afterRef.current, style: baseStyle(), ...common });
    const beforeMap = new maplibregl.Map({ container: beforeRef.current, style: baseStyle(), ...common });
    afterMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Maps may be constructed before the flex/grid parent has final size.
    requestAnimationFrame(() => {
      afterMap.resize();
      beforeMap.resize();
    });

    afterMap.on("load", () => {
      afterMap.resize();
      addItemRaster(afterMap, after);
      afterMap.addSource("det", { type: "geojson", data: detections ?? { type: "FeatureCollection", features: [] } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterMap.addLayer({ id: "det-fill", type: "fill", source: "det", paint: { "fill-color": CLASS_COLORS as any, "fill-opacity": 0.4 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterMap.addLayer({ id: "det-line", type: "line", source: "det", paint: { "line-color": CLASS_COLORS as any, "line-width": 1.6 } });
      const b = boundsOf(detections);
      if (b) afterMap.fitBounds(b, { padding: 40, duration: 0 });
    });
    beforeMap.on("load", () => {
      beforeMap.resize();
      addItemRaster(beforeMap, before);
    });

    // Keep the two cameras in lockstep.
    let syncing = false;
    const sync = (src: maplibregl.Map, dst: maplibregl.Map) => () => {
      if (syncing) return;
      syncing = true;
      dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
      syncing = false;
    };
    afterMap.on("move", sync(afterMap, beforeMap));
    beforeMap.on("move", sync(beforeMap, afterMap));

    mA.current = afterMap;
    mB.current = beforeMap;

    const ro = new ResizeObserver(() => {
      afterMap.resize();
      beforeMap.resize();
    });
    if (afterRef.current) ro.observe(afterRef.current);

    return () => {
      ro.disconnect();
      afterMap.remove();
      beforeMap.remove();
      mA.current = null;
      mB.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update rasters when scenes change.
  useEffect(() => {
    if (mA.current?.isStyleLoaded()) addItemRaster(mA.current, after);
  }, [after]);
  useEffect(() => {
    if (mB.current?.isStyleLoaded()) addItemRaster(mB.current, before);
  }, [before]);

  // Update detections.
  useEffect(() => {
    const m = mA.current;
    if (m && m.getSource("det")) {
      (m.getSource("det") as maplibregl.GeoJSONSource).setData(
        (detections ?? { type: "FeatureCollection", features: [] }) as GeoJSON.FeatureCollection,
      );
      const b = boundsOf(detections);
      if (b) m.fitBounds(b, { padding: 40, duration: 0 });
    }
  }, [detections]);

  // Clip the top (before) map to the left of the divider.
  useEffect(() => {
    if (topWrap.current) topWrap.current.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
  }, [pos]);

  const onDrag = (clientX: number, rect: DOMRect) => {
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, p)));
  };

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      onMouseMove={(e) => dragging.current && onDrag(e.clientX, e.currentTarget.getBoundingClientRect())}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchMove={(e) => dragging.current && onDrag(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
    >
      <div ref={afterRef} style={{ position: "absolute", inset: 0 }} />
      <div ref={topWrap} style={{ position: "absolute", inset: 0, clipPath: "inset(0 50% 0 0)" }}>
        <div ref={beforeRef} style={{ position: "absolute", inset: 0 }} />
      </div>

      {/* labels */}
      <span className="chip absolute left-3 top-3 z-10">BEFORE · {label(before)}</span>
      <span className="chip absolute right-3 top-3 z-10">AFTER · {label(after)}</span>

      {/* divider handle */}
      <div className="absolute inset-y-0 z-20" style={{ left: `${pos}%`, transform: "translateX(-50%)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 2, background: "var(--accent)", transform: "translateX(-50%)" }} />
        <button
          onMouseDown={() => (dragging.current = true)}
          onTouchStart={() => (dragging.current = true)}
          className="absolute top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
          style={{ left: "50%", background: "var(--accent)", color: "var(--bg)", cursor: "ew-resize" }}
          aria-label="Drag to compare"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function label(i: Item) {
  return i.id.replace(/^TCI-?/, "").slice(0, 8);
}

function boundsOf(fc?: GeoJSONFC): maplibregl.LngLatBoundsLike | null {
  if (!fc || fc.features.length === 0) return null;
  const b = new maplibregl.LngLatBounds();
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === "Polygon") g.coordinates.forEach((r) => r.forEach((c) => b.extend(c as [number, number])));
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((r) => r.forEach((c) => b.extend(c as [number, number]))));
  }
  return b.isEmpty() ? null : b;
}
