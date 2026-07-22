"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { getToken, itemTileJson } from "@/lib/api";
import type { GeoJSONFC } from "@/lib/api";

type Basemap = "dark" | "light" | "satellite";

const BASEMAPS: Record<Basemap, { tiles: string[]; attribution: string }> = {
  dark: {
    tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
    attribution: "© CARTO © OpenStreetMap",
  },
  light: {
    tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
    attribution: "© CARTO © OpenStreetMap",
  },
  satellite: {
    tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    attribution: "© Esri",
  },
};

function styleFor(b: Basemap): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: BASEMAPS[b].tiles, tileSize: 256, attribution: BASEMAPS[b].attribution },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

const CLASS_COLORS: (string | string[])[] = [
  "match",
  ["get", "change_class"],
  "urban_growth", "#c46a5a",
  "vegetation_loss", "#cb9a54",
  "vegetation_gain", "#8c9258",
  "water_change", "#5a8fc4",
  "bare_soil", "#b7bd90",
  "#a8ae79", // unknown / default
];

export function MapView({
  footprints,
  rasterItem,
  detections,
  opacity = 1,
  basemap = "dark",
  className,
}: {
  footprints?: GeoJSONFC;
  rasterItem?: { collection: string; id: string } | null;
  detections?: GeoJSONFC;
  opacity?: number;
  basemap?: Basemap;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);

  // init
  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: styleFor(basemap),
      center: [51.4, 35.7],
      zoom: 8,
      attributionControl: { compact: true },
      // Attach the JWT to same-origin catalog tile/data requests.
      transformRequest: (url) => {
        if (url.startsWith(location.origin + "/catalog")) {
          const token = getToken();
          return { url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
        }
        return { url };
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      ready.current = true;
      syncFootprints(m, footprints);
      syncRaster(m, rasterItem, opacity);
      syncDetections(m, detections);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap switch (rebuild style, re-add overlays on styledata)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    m.setStyle(styleFor(basemap));
    m.once("styledata", () => {
      syncFootprints(m, footprints);
      syncRaster(m, rasterItem, opacity);
      syncDetections(m, detections);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current) syncFootprints(m, footprints);
  }, [footprints]);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current) syncRaster(m, rasterItem, opacity);
  }, [rasterItem, opacity]);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current) syncDetections(m, detections);
  }, [detections]);

  return <div ref={ref} className={className} style={{ width: "100%", height: "100%" }} />;
}

function syncFootprints(m: maplibregl.Map, fc?: GeoJSONFC) {
  const data = fc ?? { type: "FeatureCollection", features: [] };
  const src = m.getSource("footprints") as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data as GeoJSON.FeatureCollection);
    return;
  }
  m.addSource("footprints", { type: "geojson", data: data as GeoJSON.FeatureCollection });
  m.addLayer({
    id: "footprints-fill",
    type: "fill",
    source: "footprints",
    paint: { "fill-color": "#a8ae79", "fill-opacity": 0.08 },
  });
  m.addLayer({
    id: "footprints-line",
    type: "line",
    source: "footprints",
    paint: { "line-color": "#a8ae79", "line-width": 1.2, "line-opacity": 0.7 },
  });
  raiseOverlays(m);
}

function syncRaster(m: maplibregl.Map, item: { collection: string; id: string } | null | undefined, opacity: number) {
  ["item-raster"].forEach((id) => {
    if (m.getLayer(id)) m.removeLayer(id);
  });
  if (m.getSource("item-raster")) m.removeSource("item-raster");
  if (!item) return;

  // titiler-pgstac tile template through the authenticated proxy.
  const tpl =
    `${location.origin}/catalog/raster/collections/${item.collection}/items/${item.id}` +
    `/tiles/WebMercatorQuad/{z}/{x}/{y}.png?assets=data`;
  m.addSource("item-raster", { type: "raster", tiles: [tpl], tileSize: 256 });
  // Insert the raster beneath the vector overlays so footprints/detections stay visible.
  const before = ["footprints-fill", "detections-fill"].find((id) => m.getLayer(id));
  m.addLayer(
    { id: "item-raster", type: "raster", source: "item-raster", paint: { "raster-opacity": opacity } },
    before,
  );
  raiseOverlays(m);
  void itemTileJson; // reserved for bounds-fit enhancement
}

// Keep vector overlays (footprints, then detections) above every raster layer.
function raiseOverlays(m: maplibregl.Map) {
  ["footprints-fill", "footprints-line", "detections-fill", "detections-line"].forEach((id) => {
    if (m.getLayer(id)) m.moveLayer(id); // no beforeId → move to top
  });
}

function syncDetections(m: maplibregl.Map, fc?: GeoJSONFC) {
  const data = (fc ?? { type: "FeatureCollection", features: [] }) as GeoJSON.FeatureCollection;
  const src = m.getSource("detections") as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  m.addSource("detections", { type: "geojson", data });
  m.addLayer({
    id: "detections-fill",
    type: "fill",
    source: "detections",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paint: { "fill-color": CLASS_COLORS as any, "fill-opacity": 0.35 },
  });
  m.addLayer({
    id: "detections-line",
    type: "line",
    source: "detections",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paint: { "line-color": CLASS_COLORS as any, "line-width": 1.5 },
  });
  raiseOverlays(m);
}
