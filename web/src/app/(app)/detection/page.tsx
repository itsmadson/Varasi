"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { SwipeMap } from "@/components/SwipeMap";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { PageHeader } from "@/components/ui";
import { api, type DetectResult, type StacItem } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";
import { classBreakdown, downloadCSV, downloadGeoJSON, km2, nearestScene, printReport } from "@/lib/report";
import { ClassStyleControl, useClassStyle } from "@/components/ClassStyleControl";
import { CATEGORIES, needsUrban } from "@/lib/changeClasses";
import type { GeoJSONFC } from "@/lib/api";

const ALGORITHMS = ["image_diff", "vegetation"] as const;

function bboxIntersection(a: number[], b: number[]): number[] {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}
function bboxPolygon(bb: number[]) {
  return { type: "Polygon", coordinates: [[[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]] };
}
function date(i: StacItem) {
  return String(i.properties.datetime ?? "").slice(0, 10);
}
function cloud(i: StacItem): number | null {
  const c = i.properties["eo:cloud_cover"];
  return typeof c === "number" ? c : null;
}
// Short source tag from the raster's collection — metadata only, not a filter.
function source(i: StacItem) {
  return String(i.collection ?? "").replace(/^sentinel-2-?/, "S2·").slice(0, 12) || "raster";
}

export default function DetectionPage() {
  const { t } = useI18n();
  const clsLabel = (c: string) => t(`class.${c}` as MsgKey);
  const [mode, setMode] = useState<"scene" | "date">("scene");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [maxCloud, setMaxCloud] = useState(100);
  const [algorithm, setAlgorithm] = useState<(typeof ALGORITHMS)[number]>("image_diff");
  const [threshold, setThreshold] = useState(0.5);
  const [minArea, setMinArea] = useState(40000);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [report, setReport] = useState<ReportModel | null>(null);

  const cs = useClassStyle();
  const capture = useRef<(() => string | null) | null>(null);

  const modelsQ = useQuery({ queryKey: ["models"], queryFn: api.models });
  const catalog = modelsQ.data?.models ?? [];
  const compliance = useQuery({ queryKey: ["compliance"], queryFn: api.permitCompliance });
  const [modelByCategory, setModelByCategory] = useState<Record<string, string>>({});
  const [allowCloud, setAllowCloud] = useState(false);

  // All rasters in the catalog — no collection gate.
  const scenes = useQuery({ queryKey: ["scenes-all-det"], queryFn: () => api.search({ limit: 60 }) });
  const items = scenes.data?.features ?? [];
  const cloudy = useMemo(
    () => items.filter((i) => cloud(i) == null || (cloud(i) as number) <= maxCloud),
    [items, maxCloud],
  );

  const { before, after } = useMemo(() => {
    if (mode === "date") {
      return {
        before: nearestScene(cloudy, beforeDate ? `${beforeDate}T00:00:00Z` : "") ?? undefined,
        after: nearestScene(cloudy, afterDate ? `${afterDate}T00:00:00Z` : "") ?? undefined,
      };
    }
    return { before: items.find((i) => i.id === beforeId), after: items.find((i) => i.id === afterId) };
  }, [mode, cloudy, items, beforeDate, afterDate, beforeId, afterId]);

  // Per-tag backend override map from the per-category model dropdowns.
  const buildModels = (): Record<string, string> => {
    const m: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      const pick = modelByCategory[cat.key];
      if (pick && pick !== "auto") for (const c of cat.classes) if (cs.enabled.has(c)) m[c] = pick;
    }
    return m;
  };

  const run = useMutation({
    mutationFn: () => {
      if (!before || !after) throw new Error(t("detect.pickTwo"));
      const aoi = bboxPolygon(bboxIntersection(before.bbox, after.bbox));
      return api.runDetection({
        before: { collection: before.collection, item_id: before.id, datetime: date(before) },
        after: { collection: after.collection, item_id: after.id, datetime: date(after) },
        aoi,
        algorithm,
        // Urban classifier runs automatically when a construction class is ticked.
        classifier: needsUrban(cs.enabled) ? "urban" : "standard",
        threshold,
        min_area_m2: minArea,
        tags: [...cs.enabled],
        models: buildModels(),
        allow_cloud: allowCloud,
      });
    },
    onSuccess: (r) => {
      setResult(r);
      compliance.refetch();
    },
  });

  const detections: GeoJSONFC | undefined = useMemo(
    () => (result ? { type: "FeatureCollection", features: result.features } : undefined),
    [result],
  );

  // Classes actually present in the result (for highlighting the picker).
  const present = useMemo(() => {
    const s = new Set<string>();
    for (const f of result?.features ?? []) s.add(String((f.properties as Record<string, unknown>)?.change_class ?? "unknown"));
    return s;
  }, [result]);

  // Only show the classes the user enabled — "choose what to detect".
  const shown: GeoJSONFC | undefined = useMemo(() => {
    if (!detections) return undefined;
    return {
      type: "FeatureCollection",
      features: detections.features.filter((f) => cs.enabled.has(String((f.properties as Record<string, unknown>)?.change_class ?? "unknown"))),
    };
  }, [detections, cs.enabled]);

  const exportPdf = () => {
    const fc = shown ?? { type: "FeatureCollection", features: [] };
    setReport({
      kind: "Change Detection",
      title: before && after ? `${date(before)} → ${date(after)}` : "Change detection",
      dateRange: `Algorithm ${algorithm} · threshold ${threshold.toFixed(2)}`,
      meta: [
        { label: "Before raster", value: before ? `${date(before)} · ${source(before)}` : "—" },
        { label: "After raster", value: after ? `${date(after)} · ${source(after)}` : "—" },
        { label: "Rasters in catalog", value: String(items.length) },
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
    });
    requestAnimationFrame(() => requestAnimationFrame(() => printReport()));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader title={t("nav.detection")} subtitle={t("detect.subtitle")} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[340px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
            {scenes.isLoading ? t("detect.loadingRasters") : t("detect.rastersCount", { n: items.length })}
          </div>

          <Field label={t("detect.pickBy")}>
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
                  {mo === "scene" ? t("detect.byRaster") : t("detect.byDate")}
                </button>
              ))}
            </div>
          </Field>

          {mode === "scene" ? (
            <>
              <Field label={t("detect.beforeRaster")}>
                <SceneSelect items={items} value={beforeId} onChange={setBeforeId} />
              </Field>
              <Field label={t("detect.afterRaster")}>
                <SceneSelect items={items} value={afterId} onChange={setAfterId} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("detect.beforeDate")}>
                <input type="date" className="input" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)} />
              </Field>
              <Field label={t("detect.afterDate")}>
                <input type="date" className="input" value={afterDate} onChange={(e) => setAfterDate(e.target.value)} />
              </Field>
              <Field label={`${t("wa.maxCloud")} · ${maxCloud}%`}>
                <input type="range" min={0} max={100} step={5} value={maxCloud} onChange={(e) => setMaxCloud(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
              </Field>
              <div className="panel space-y-1 p-3">
                <div className="label">{t("detect.chosen")}</div>
                <ChosenRow k={t("common.before")} i={before} target={beforeDate} noMatch={t("detect.noMatch")} />
                <ChosenRow k={t("common.after")} i={after} target={afterDate} noMatch={t("detect.noMatch")} />
              </div>
            </>
          )}

          <Field label={t("detect.algorithm")}>
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

          <Field label={`${t("detect.threshold")} · ${threshold.toFixed(2)}`}>
            <input type="range" min={0.2} max={0.9} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          </Field>

          {/* Min feature size — drop to a few hundred m² when running on high-res
              imagery to resolve individual plots/buildings. */}
          <Field label={`${t("detect.minSize")} · ${minArea < 10000 ? `${minArea} m²` : `${(minArea / 1e6).toFixed(2)} km²`}`}>
            <input
              type="range"
              min={200}
              max={100000}
              step={200}
              value={minArea}
              onChange={(e) => setMinArea(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <ClassStyleControl
            style={cs.style}
            present={present}
            onColor={cs.setColor}
            onToggle={cs.toggle}
            onToggleCategory={cs.toggleCategory}
            onReset={cs.reset}
            catalog={catalog}
            modelByCategory={modelByCategory}
            onModel={(cat, name) => setModelByCategory((m) => ({ ...m, [cat]: name }))}
          />

          <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
            <input type="checkbox" checked={allowCloud} onChange={(e) => setAllowCloud(e.target.checked)} className="accent-[var(--accent)]" />
            {t("model.allowCloud")}
          </label>

          <button className="btn w-full" disabled={!before || !after || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? t("detect.running") : t("detect.run")}
          </button>
          {run.isError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {(run.error as Error).message}
            </p>
          )}

          {result && (
            <div className="panel space-y-2 p-3">
              <div className="label">{t("detect.result")}</div>
              <Row k={t("metric.polygons")} v={result.stats.polygon_count} />
              <Row k={t("metric.changedArea")} v={`${km2(result.stats.changed_area_m2)} km²`} />
              <Row k={t("metric.changed")} v={`${(result.stats.changed_fraction * 100).toFixed(1)}%`} />
              <div className="label mt-2">{t("detect.byClass")}</div>
              {Object.entries(result.stats.class_breakdown)
                .filter(([k]) => cs.enabled.has(k))
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: cs.colors[k] ?? "var(--accent)" }} />
                    <span className="flex-1" style={{ color: "var(--muted)" }}>
                      {clsLabel(k)}
                    </span>
                    <span className="telemetry">{km2(v)} km²</span>
                  </div>
                ))}
              {compliance.data && compliance.data.permits_total > 0 && (
                <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--panel-2)" }}>
                  <div className="label mb-1.5">{t("permits.compliance")}</div>
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: "var(--danger)" }}>{t("permits.unpermitted")}</span>
                    <span className="telemetry" style={{ color: "var(--danger)" }}>{compliance.data.unpermitted_count}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: "var(--warn)" }}>{t("permits.noStart")}</span>
                    <span className="telemetry">{compliance.data.no_start_count}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: "var(--muted)" }}>{t("permits.permitted")}</span>
                    <span className="telemetry">{compliance.data.permitted_count}</span>
                  </div>
                </div>
              )}

              {result.provenance && Object.keys(result.provenance).length > 0 && (
                <>
                  <div className="label mt-3">{t("model.provenance")}</div>
                  {Object.entries(result.provenance).map(([tag, backend]) => (
                    <div key={tag} className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--muted)" }}>{tag === "*" ? "—" : clsLabel(tag)}</span>
                      <span className="telemetry">{backend}</span>
                    </div>
                  ))}
                </>
              )}

              {result.urban && (
                <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--panel-2)" }}>
                  <div className="label mb-2">🏙 {t("urban.title")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <UrbanStat label={t("urban.impervious")} value={`${km2(result.urban.impervious_gain_m2)} km²`} accent />
                    <UrbanStat label={t("urban.construction")} value={`${km2(result.urban.construction_area_m2)} km²`} />
                    <UrbanStat label={t("urban.sites")} value={String(result.urban.new_construction_sites)} />
                    <UrbanStat label={t("urban.demolition")} value={`${km2(result.urban.demolition_m2)} km²`} />
                  </div>
                  <div className="label mb-1 mt-3">{t("urban.stages")}</div>
                  {([["1", t("urban.stage1")], ["2", t("urban.stage2")], ["3", t("urban.stage3")]] as const).map(([k, lbl]) => (
                    <div key={k} className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--muted)" }}>{lbl}</span>
                      <span className="telemetry">{km2(result.urban!.stage_area_m2[k] ?? 0)} km²</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="label mt-3">{t("common.export")}</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button className="chip" onClick={exportPdf}>PDF</button>
                <button className="chip" onClick={() => downloadGeoJSON(shown!, "varasi-detection")}>GeoJSON</button>
                <button className="chip" onClick={() => downloadCSV(shown!, "varasi-detection")}>CSV</button>
              </div>
            </div>
          )}
        </div>

        <div className="relative min-h-0">
          {before && after ? (
            <SwipeMap
              before={{ collection: before.collection, id: before.id }}
              after={{ collection: after.collection, id: after.id }}
              detections={shown}
              classColors={cs.colors}
              captureRef={capture}
              className="absolute inset-0"
            />
          ) : (
            <MapView
              rasterItem={after ? { collection: after.collection, id: after.id } : null}
              detections={shown}
              classColors={cs.colors}
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
function UrbanStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md p-2" style={{ background: "var(--bg)" }}>
      <div className="telemetry text-sm font-600" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>
        {value}
      </div>
      <div className="telemetry mt-0.5 text-[9px]" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}
function ChosenRow({ k, i, target, noMatch }: { k: string; i?: StacItem; target: string; noMatch: string }) {
  const c = i ? cloud(i) : null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className="telemetry" style={{ color: i ? "var(--text)" : "var(--warn)" }}>
        {i ? `${date(i)} · ${source(i)}${c != null ? ` · ${c.toFixed(0)}%` : ""}` : target ? noMatch : "—"}
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
          {date(i)} · {source(i)} · {i.id.slice(0, 10)}
        </option>
      ))}
    </select>
  );
}
