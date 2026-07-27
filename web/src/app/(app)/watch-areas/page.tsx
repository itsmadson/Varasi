"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { Modal } from "@/components/Modal";
import { DrawMap } from "@/components/DrawMap";
import { PageHeader, Spinner } from "@/components/ui";
import { api, type EvalResult } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";

const PRIORITY_COLOR = ["", "var(--danger)", "var(--warn)", "var(--accent)", "var(--muted)", "var(--muted)"];
const ALERT_CLASSES = ["urban_growth", "vegetation_loss", "vegetation_gain", "water_change", "bare_soil"] as const;

export default function WatchAreasPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(null);
  const [evalMap, setEvalMap] = useState<Record<string, EvalResult>>({});
  const wa = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });

  // New watch-area form.
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(3);
  const [threshold, setThreshold] = useState(0.1);
  const [maxCloud, setMaxCloud] = useState(60);
  const [cadence, setCadence] = useState("on-ingest");
  const [alertClasses, setAlertClasses] = useState<string[]>([]);
  const [urban, setUrban] = useState(false);
  const [geom, setGeom] = useState<GeoJSON.Polygon | null>(null);
  const toggleClass = (c: string) =>
    setAlertClasses((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const evaluate = useMutation({
    mutationFn: (id: string) => api.evaluateWatchArea(id),
    onSuccess: (res, id) => {
      setEvalMap((m) => ({ ...m, [id]: res }));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api.createWatchArea({
        name,
        geometry: geom,
        priority,
        threshold,
        max_cloud: maxCloud,
        cadence,
        alert_classes: alertClasses,
        classifier: urban ? "urban" : "standard",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watch-areas"] });
      setOpen(false);
      setName("");
      setGeom(null);
      setPriority(3);
      setThreshold(0.1);
      setMaxCloud(60);
      setCadence("on-ingest");
      setAlertClasses([]);
      setUrban(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWatchArea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watch-areas"] }),
  });

  const fc = useMemo(() => wa.data ?? { type: "FeatureCollection" as const, features: [] }, [wa.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pb-4 pt-6">
        <PageHeader title={t("nav.watchAreas")} />
        <button className="btn" onClick={() => setOpen(true)}>
          + {t("wa.new")}
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[360px_1fr]">
        <div className="min-h-0 overflow-auto p-5">
          {wa.isLoading ? (
            <Spinner label={t("common.loading")} />
          ) : (
            <div className="space-y-2">
              {fc.features.map((f) => {
                const p = (f.properties ?? {}) as Record<string, unknown>;
                const id = String(f.id);
                const priority = Number(p.priority ?? 3);
                const res = evalMap[id];
                const busy = evaluate.isPending && evaluate.variables === id;
                return (
                  <div
                    key={id}
                    onClick={() => setFocus(id)}
                    className="panel p-3"
                    style={{ outline: focus === id ? "2px solid var(--accent)" : "none", cursor: "pointer" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_COLOR[priority] }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-500">{String(p.name)}</div>
                        <div className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
                          P{priority} · θ {Number(p.threshold ?? 0).toFixed(2)}
                        </div>
                      </div>
                      <button
                        className="chip"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          evaluate.mutate(id);
                        }}
                      >
                        {busy ? t("wa.evaluating") : t("wa.evaluate")}
                      </button>
                      <button
                        className="btn-ghost !px-1.5"
                        title={t("common.open")}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/watch-areas/${id}`);
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                      <button
                        className="btn-ghost !px-1.5"
                        title={t("wa.delete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove.mutate(id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                    {res && (
                      <div
                        className="telemetry mt-2 border-t pt-2 text-[10px]"
                        style={{ color: res.alerted ? "var(--danger)" : "var(--muted)" }}
                      >
                        {res.evaluated
                          ? `${(res.changed_fraction * 100).toFixed(1)}% changed · ${res.alerted ? "ALERT RAISED" : "below threshold"}`
                          : res.reason}
                      </div>
                    )}
                  </div>
                );
              })}
              {fc.features.length === 0 && (
                <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>
                  No watch areas yet.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="relative min-h-0 border-t lg:border-s lg:border-t-0">
          <MapView footprints={fc} className="absolute inset-0" />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("wa.new")} width={780}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (geom) create.mutate();
          }}
        >
          <DrawMap onGeometry={setGeom} className="h-72 w-full overflow-hidden rounded-lg border" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="label mb-1 block">{t("form.name")}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label mb-1 block">{t("wa.priority")}</label>
              <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label mb-1 block">
                {t("wa.threshold")} · {threshold.toFixed(2)}
              </label>
              <input
                type="range"
                min={0.02}
                max={0.5}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
            </div>

            <div>
              <label className="label mb-1 block">{t("wa.cadence")}</label>
              <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="on-ingest">{t("wa.cadOnIngest")}</option>
                <option value="daily">{t("wa.cadDaily")}</option>
                <option value="weekly">{t("wa.cadWeekly")}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label mb-1 block">{t("wa.maxCloud")} · {maxCloud}%</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={maxCloud}
                onChange={(e) => setMaxCloud(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="label mb-1.5 block">{t("wa.alertClasses")}</label>
              <div className="flex flex-wrap gap-1.5">
                {ALERT_CLASSES.map((c) => {
                  const on = alertClasses.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleClass(c)}
                      className="chip"
                      style={{
                        color: on ? "var(--bg)" : "var(--muted)",
                        background: on ? "var(--accent)" : "transparent",
                        borderColor: on ? "var(--accent)" : "var(--border)",
                      }}
                    >
                      {t(`class.${c}` as MsgKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-3">
              <button
                type="button"
                onClick={() => setUrban((v) => !v)}
                className="panel flex w-full items-center gap-2.5 p-2.5 text-start"
                style={{ borderColor: urban ? "var(--accent)" : "var(--border)" }}
              >
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center rounded"
                  style={{ background: urban ? "var(--accent)" : "transparent", border: `1px solid ${urban ? "var(--accent)" : "var(--border)"}` }}
                >
                  {urban && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="var(--bg)" strokeWidth="3">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="text-xs font-600">🏙 {t("detect.urban")}</span>
                  <span className="telemetry mt-0.5 block text-[9px]" style={{ color: "var(--muted)" }}>
                    {t("detect.urbanHint")}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {!geom && (
            <p className="telemetry text-[10px]" style={{ color: "var(--warn)" }}>
              {t("wa.needShape")}
            </p>
          )}
          {create.isError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn" disabled={!name || !geom || create.isPending}>
              {create.isPending ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
