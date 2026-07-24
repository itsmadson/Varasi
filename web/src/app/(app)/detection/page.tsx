"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { SwipeMap } from "@/components/SwipeMap";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { PageHeader } from "@/components/ui";
import { api, type DetectResult, type StacItem } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import { classBreakdown, downloadCSV, downloadGeoJSON, km2, nearestScene, printReport } from "@/lib/report";
import type { GeoJSONFC } from "@/lib/api";

const ALGORITHMS = ["image_diff", "vegetation"] as const;

const CLASS_COLOR: Record<string, string> = {
  urban_growth: "#c46a5a",
  vegetation_loss: "#cb9a54",
  vegetation_gain: "#8c9258",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#a8ae79",
};

function bboxIntersection(a: number[], b: number[]): number[] {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}
function bboxPolygon(bb: number[]) {
  return {
    type: "Polygon",
    coordinates: [[[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]],
  };
}
function date(i: StacItem) {
  return String(i.properties.datetime ?? "").slice(0, 10);
}
function cloud(i: StacItem): number | null {
  const c = i.properties["eo:cloud_cover"];
  return typeof c === "number" ? c : null;
}

export default function DetectionPage() {
  const { t } = useI18n();
  const [collection, setCollection] = useState("sentinel-2-tehran");
  const [mode, setMode] = useState<"scene" | "date">("scene");
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const [beforeDate, setBeforeDate] = useState<string>("");
  const [afterDate, setAfterDate] = useState<string>("");
  const [maxCloud, setMaxCloud] = useState(100);
  const [algorithm, setAlgorithm] = useState<(typeof ALGORITHMS)[number]>("image_diff");
  const [threshold, setThreshold] = useState(0.5);
  const [result, setResult] = useState<DetectResult | null>(null);

  const capture = useRef<(() => string | null) | null>(null);

  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const scenes = useQuery({
    queryKey: ["scenes", collection],
    queryFn: () => api.search({ collections: [collection], limit: 50 }),
    enabled: !!collection,
  });

  const items = scenes.data?.features ?? [];
  const cloudy = useMemo(
    () => items.filter((i) => cloud(i) == null || (cloud(i) as number) <= maxCloud),
    [items, maxCloud],
  );

  // Effective before/after scene depends on the mode.
  const { before, after } = useMemo(() => {
    if (mode === "date") {
      return {
        before: nearestScene(cloudy, beforeDate ? `${beforeDate}T00:00:00Z` : "") ?? undefined,
        after: nearestScene(cloudy, afterDate ? `${afterDate}T00:00:00Z` : "") ?? undefined,
      };
    }
    return {
      before: items.find((i) => i.id === beforeId),
      after: items.find((i) => i.id === afterId),
    };
  }, [mode, cloudy, items, beforeDate, afterDate, beforeId, afterId]);

  const run = useMutation({
    mutationFn: () => {
      if (!before || !after) throw new Error("pick two scenes");
      const aoi = bboxPolygon(bboxIntersection(before.bbox, after.bbox));
      return api.runDetection({
        before: { collection, item_id: before.id, datetime: date(before) },
        after: { collection, item_id: after.id, datetime: date(after) },
        aoi,
        algorithm,
        threshold,
        min_area_m2: 40000,
      });
    },
    onSuccess: (r) => setResult(r),
  });

  const detections: GeoJSONFC | undefined = useMemo(
    () => (result ? { type: "FeatureCollection", features: result.features } : undefined),
    [result],
  );

  const exportPdf = () => {
    setReport(buildReport());
    // Let the report DOM (incl. the map image) paint, then print.
    requestAnimationFrame(() => requestAnimationFrame(() => printReport()));
  };
  const [report, setReport] = useState<ReportModel | null>(null);
  const buildReport = (): ReportModel => {
    const fc = detections ?? { type: "FeatureCollection", features: [] };
    return {
      kind: "Change Detection",
      title: `${collection}`,
      subtitle: before && after ? `${date(before)} → ${date(after)}` : undefined,
      dateRange: `Algorithm ${algorithm} · threshold ${threshold.toFixed(2)}`,
      meta: [
        { label: "Before scene", value: before ? `${date(before)} · ${before.id.slice(0, 16)}` : "—" },
        { label: "After scene", value: after ? `${date(after)} · ${after.id.slice(0, 16)}` : "—" },
        { label: "Collection", value: collection },
      ],
      mapImage: capture.current?.() ?? null,
      stats: result
        ? [
            { label: "Regions", value: String(result.stats.polygon_count) },
            { label: "Changed area", value: `${km2(result.stats.changed_area_m2)} km²` },
            { label: "Changed", value: `${(result.stats.changed_fraction * 100).toFixed(1)}%` },
            { label: "Classes", value: String(Object.keys(result.stats.class_breakdown).length) },
          ]
        : [],
      classBreakdown: classBreakdown(fc),
      footerNote: "Ad-hoc change-detection report · Varasi",
    };
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader title={t("nav.detection")} subtitle="Pair two scenes — or two dates — and detect change." />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[340px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          <Field label={t("lib.collection")}>
            <select
              className="input"
              value={collection}
              onChange={(e) => {
                setCollection(e.target.value);
                setBeforeId("");
                setAfterId("");
              }}
            >
              {collections.data?.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
          </Field>

          {/* Mode toggle */}
          <Field label="Pick by">
            <div className="flex gap-1">
              {(["scene", "date"] as const).map((mo) => (
                <button
                  key={mo}
                  onClick={() => setMode(mo)}
                  className="chip flex-1 text-center"
                  style={{
                    color: mode === mo ? "var(--bg)" : "var(--muted)",
                    background: mode === mo ? "var(--accent)" : "transparent",
                    borderColor: mode === mo ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {mo === "scene" ? "Scene" : "Date"}
                </button>
              ))}
            </div>
          </Field>

          {mode === "scene" ? (
            <>
              <Field label="Before">
                <SceneSelect items={items} value={beforeId} onChange={setBeforeId} />
              </Field>
              <Field label="After">
                <SceneSelect items={items} value={afterId} onChange={setAfterId} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Before date">
                <input type="date" className="input" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)} />
              </Field>
              <Field label="After date">
                <input type="date" className="input" value={afterDate} onChange={(e) => setAfterDate(e.target.value)} />
              </Field>
              <Field label={`Max cloud · ${maxCloud}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={maxCloud}
                  onChange={(e) => setMaxCloud(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </Field>
              <div className="panel space-y-1 p-3">
                <div className="label">Chosen scenes</div>
                <ChosenRow k="Before" i={before} target={beforeDate} />
                <ChosenRow k="After" i={after} target={afterDate} />
              </div>
            </>
          )}

          <Field label="Algorithm">
            <div className="flex gap-1">
              {ALGORITHMS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAlgorithm(a)}
                  className="chip flex-1 text-center"
                  style={{
                    color: algorithm === a ? "var(--bg)" : "var(--muted)",
                    background: algorithm === a ? "var(--accent)" : "transparent",
                    borderColor: algorithm === a ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`Threshold · ${threshold.toFixed(2)}`}>
            <input
              type="range"
              min={0.2}
              max={0.9}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <button className="btn w-full" disabled={!before || !after || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Detecting…" : "Run change detection"}
          </button>
          {run.isError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {(run.error as Error).message}
            </p>
          )}

          {result && (
            <div className="panel space-y-2 p-3">
              <div className="label">Result</div>
              <Row k="Polygons" v={result.stats.polygon_count} />
              <Row k="Changed area" v={`${km2(result.stats.changed_area_m2)} km²`} />
              <Row k="Changed" v={`${(result.stats.changed_fraction * 100).toFixed(1)}%`} />
              <div className="label mt-2">By class</div>
              {Object.entries(result.stats.class_breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[k] ?? "var(--accent)" }} />
                    <span className="flex-1" style={{ color: "var(--muted)" }}>
                      {k.replace("_", " ")}
                    </span>
                    <span className="telemetry">{km2(v)} km²</span>
                  </div>
                ))}

              {/* Export row */}
              <div className="label mt-3">Export</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button className="chip" onClick={exportPdf}>
                  PDF
                </button>
                <button className="chip" onClick={() => downloadGeoJSON(detections!, `varasi-${collection}`)}>
                  GeoJSON
                </button>
                <button className="chip" onClick={() => downloadCSV(detections!, `varasi-${collection}`)}>
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative min-h-0">
          {before && after ? (
            <SwipeMap
              before={{ collection, id: before.id }}
              after={{ collection, id: after.id }}
              detections={detections}
              captureRef={capture}
              className="absolute inset-0"
            />
          ) : (
            <MapView
              rasterItem={after ? { collection, id: after.id } : null}
              detections={detections}
              opacity={0.9}
              captureRef={capture}
              className="absolute inset-0"
            />
          )}
        </div>
      </div>

      {report && <ReportDoc model={report} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className="telemetry">{v}</span>
    </div>
  );
}
function ChosenRow({ k, i, target }: { k: string; i?: StacItem; target: string }) {
  const c = i ? cloud(i) : null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className="telemetry" style={{ color: i ? "var(--text)" : "var(--warn)" }}>
        {i ? `${date(i)}${c != null ? ` · ${c.toFixed(0)}%` : ""}` : target ? "no match" : "—"}
      </span>
    </div>
  );
}
function SceneSelect({ items, value, onChange }: { items: StacItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {date(i)} · {i.id.slice(0, 14)}
        </option>
      ))}
    </select>
  );
}
