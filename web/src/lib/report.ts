// Client-side report + export helpers. No server, no PDF library: branded HTML
// printed via window.print() ("Save as PDF"), plus raw GeoJSON/CSV downloads.

import type { GeoJSONFC } from "@/lib/api";

const CLASS_WEIGHT: Record<string, number> = {
  urban_growth: 1.0,
  water_change: 0.9,
  vegetation_loss: 0.8,
  bare_soil: 0.6,
  vegetation_gain: 0.4,
  unknown: 0.3,
};

export const km2 = (m2: number) => (m2 / 1e6).toFixed(2);

function saveBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGeoJSON(fc: GeoJSONFC, name = "varasi-detections") {
  saveBlob(JSON.stringify(fc, null, 2), `${name}.geojson`, "application/geo+json");
}

// One CSV row per polygon: class, confidence, area, dates.
export function downloadCSV(fc: GeoJSONFC, name = "varasi-detections") {
  const head = ["change_class", "confidence", "area_m2", "area_km2", "before_date", "after_date"];
  const rows = fc.features.map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const area = Number(p.area_m2 ?? 0);
    return [
      String(p.change_class ?? "unknown"),
      Number(p.confidence ?? 0).toFixed(3),
      area.toFixed(0),
      (area / 1e6).toFixed(4),
      String(p.before_date ?? "").slice(0, 10),
      String(p.after_date ?? "").slice(0, 10),
    ].join(",");
  });
  saveBlob([head.join(","), ...rows].join("\n"), `${name}.csv`, "text/csv");
}

// Severity score for a feature collection: Σ(area × classWeight × confidence).
export function severityScore(fc: GeoJSONFC): number {
  return fc.features.reduce((sum, f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const cls = String(p.change_class ?? "unknown");
    const area = Number(p.area_m2 ?? 0);
    const conf = Number(p.confidence ?? 1);
    return sum + area * (CLASS_WEIGHT[cls] ?? 0.3) * conf;
  }, 0);
}

// Area per change class from a feature collection.
export function classBreakdown(fc: GeoJSONFC): { class: string; area_m2: number }[] {
  const by: Record<string, number> = {};
  for (const f of fc.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const cls = String(p.change_class ?? "unknown");
    by[cls] = (by[cls] ?? 0) + Number(p.area_m2 ?? 0);
  }
  return Object.entries(by)
    .map(([cls, area_m2]) => ({ class: cls, area_m2 }))
    .sort((a, b) => b.area_m2 - a.area_m2);
}

// Pick the scene whose datetime is closest to a target date (ISO string).
export function nearestScene<T extends { properties: Record<string, unknown> }>(
  items: T[],
  targetISO: string,
): T | null {
  if (!items.length || !targetISO) return null;
  const target = new Date(targetISO).getTime();
  let best: T | null = null;
  let bestDelta = Infinity;
  for (const it of items) {
    const dt = String(it.properties.datetime ?? "");
    if (!dt) continue;
    const delta = Math.abs(new Date(dt).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = it;
    }
  }
  return best;
}

// Print the report container. ReportDoc renders it; @media print isolates it.
export function printReport() {
  window.print();
}
