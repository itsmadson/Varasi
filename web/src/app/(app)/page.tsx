"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";
import { CLASS_COLOR } from "@/lib/changeClasses";
import type { GeoJSONFC } from "@/lib/api";

const SEV = (s: string) => (s === "critical" ? "var(--danger)" : s === "warning" ? "var(--warn)" : "var(--accent)");
const km2 = (m2: number) => (m2 / 1e6).toFixed(1);

export default function DashboardPage() {
  const { t } = useI18n();
  const router = useRouter();
  const clsLabel = (c: string) => t(`class.${c}` as MsgKey);
  const [basemap, setBasemap] = useState<"dark" | "light" | "satellite">("dark");

  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const search = useQuery({ queryKey: ["scenes-all"], queryFn: () => api.search({ limit: 100 }) });
  const watch = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api.alerts(), refetchInterval: 10000 });
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });
  const models = useQuery({ queryKey: ["models"], queryFn: api.models });

  const list = alerts.data?.alerts ?? [];
  const open = list.filter((a) => !a.acknowledged);
  const hottest = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const scenes = search.data?.features ?? [];
  const cat = models.data?.models ?? [];
  const ready = cat.filter((m) => m.available).length;

  const footprints: GeoJSONFC = useMemo(
    () => ({
      type: "FeatureCollection",
      features: scenes.map((f) => ({ type: "Feature", geometry: f.geometry, properties: { id: f.id } })),
    }),
    [scenes],
  );

  const series = analytics.data?.series ?? [];
  const byClass = analytics.data?.by_class ?? [];
  const maxMonth = Math.max(1, ...series.map((s) => s.area_m2));
  const maxClass = Math.max(1, ...byClass.map((c) => c.area_m2));

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-6">
        <div>
          <h1 className="text-xl font-700" style={{ letterSpacing: "-0.01em" }}>
            {t("dash.title")}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            {t("dash.subtitle")}
          </p>
        </div>
        <span className="chip flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--accent)" }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          </span>
          {t("dash.live")}
        </span>
      </div>

      {/* KPI ribbon — a single telemetry strip, hairline-divided monospace cells. */}
      <div className="mx-6 grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t("stat.scenes")} value={scenes.length} hint="pgSTAC" />
        <Kpi label={t("stat.collections")} value={collections.data?.collections.length ?? 0} />
        <Kpi label={t("stat.watchAreas")} value={watch.data?.features.length ?? 0} />
        <Kpi label={t("stat.detections")} value={analytics.data?.totals.detections ?? 0} />
        <Kpi label={t("stat.changedArea")} value={`${km2(analytics.data?.totals.changed_area_m2 ?? 0)} km²`} />
        <Kpi label={t("stat.alerts")} value={open.length} danger={open.length > 0} />
      </div>

      {/* Main bento: map + live alert stream / hottest */}
      <div className="grid grid-cols-1 gap-4 px-6 pt-4 lg:grid-cols-3">
        <div className="panel relative h-[440px] overflow-hidden p-0 lg:col-span-2">
          <MapView footprints={footprints} basemap={basemap} className="absolute inset-0" />
          <div className="glass absolute end-3 top-3 z-10 flex gap-1 rounded-lg p-1.5">
            {(["dark", "light", "satellite"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasemap(b)}
                className="chip"
                style={{
                  color: basemap === b ? "var(--bg)" : "var(--muted)",
                  background: basemap === b ? "var(--accent)" : "transparent",
                  borderColor: basemap === b ? "var(--accent)" : "var(--border)",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="flex h-[440px] flex-col gap-4">
          {/* Alert stream */}
          <div className="panel flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">{t("dash.alertStream")}</span>
              <button className="chip" onClick={() => router.push("/alerts")}>
                {t("dash.viewAll")}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-auto pe-1">
              {list.length === 0 && (
                <div className="telemetry py-4 text-center text-[10px]" style={{ color: "var(--muted)" }}>
                  {t("dash.noAlerts")}
                </div>
              )}
              {list.slice(0, 12).map((a) => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/alerts/${a.id}`)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-[var(--panel-2)]"
                  style={{ opacity: a.acknowledged ? 0.5 : 1 }}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV(a.severity) }} />
                  <span className="min-w-0 flex-1 truncate text-[11px]">{a.watch_area ?? a.title}</span>
                  <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
                    {a.created_at?.slice(5, 10)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Hottest areas */}
          <div className="panel p-3">
            <div className="label mb-2">{t("dash.hottest")}</div>
            {hottest.length === 0 && (
              <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
                —
              </div>
            )}
            {hottest.map((a, i) => (
              <button
                key={a.id}
                onClick={() => router.push(`/alerts/${a.id}`)}
                className="flex w-full items-center gap-2 py-1 text-start"
              >
                <span className="telemetry w-4 text-[10px]" style={{ color: "var(--muted)" }}>
                  {i + 1}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV(a.severity) }} />
                <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--muted)" }}>
                  {a.watch_area ?? a.title}
                </span>
                <span className="telemetry text-[10px]">{(a.score ?? 0).toFixed(0)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lower bento: charts + model zoo */}
      <div className="grid grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-3">
        {/* Change over time */}
        <div className="panel p-4">
          <div className="label mb-3">{t("dash.overTime")}</div>
          {series.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex h-32 items-end gap-1.5">
              {series.map((s) => (
                <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${(s.area_m2 / maxMonth) * 100}%`, background: "var(--accent)" }}
                      title={`${km2(s.area_m2)} km²`}
                    />
                  </div>
                  <span className="telemetry text-[8px]" style={{ color: "var(--muted)" }}>
                    {s.month.slice(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By class */}
        <div className="panel p-4">
          <div className="label mb-3">{t("dash.byClass")}</div>
          {byClass.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2.5">
              {byClass.slice(0, 6).map((c) => (
                <div key={c.class}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[c.class] ?? "var(--accent)" }} />
                      {clsLabel(c.class)}
                    </span>
                    <span className="telemetry" style={{ color: "var(--muted)" }}>
                      {km2(c.area_m2)} km²
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--panel-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(c.area_m2 / maxClass) * 100}%`, background: CLASS_COLOR[c.class] ?? "var(--accent)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model zoo status */}
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label">{t("dash.modelZoo")}</span>
            <span className="telemetry text-[10px]" style={{ color: "var(--accent)" }}>
              {ready}/{cat.length}
            </span>
          </div>
          <div className="max-h-32 space-y-1.5 overflow-auto pe-1">
            {cat.map((m) => (
              <div key={m.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.available ? "var(--accent)" : "var(--border)" }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: m.available ? "var(--text)" : "var(--muted)" }}>
                  {m.title}
                </span>
                <span className="telemetry text-[8px] uppercase" style={{ color: "var(--muted)" }}>
                  {m.runtime}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, danger }: { label: string; value: React.ReactNode; hint?: string; danger?: boolean }) {
  return (
    <div className="border-e border-b p-3.5 last:border-e-0" style={{ borderColor: "var(--border)" }}>
      <div className="label">{label}</div>
      <div className="telemetry mt-1.5 text-2xl font-600" style={{ color: danger ? "var(--danger)" : "var(--text)" }}>
        {value}
      </div>
      {hint && (
        <div className="telemetry mt-0.5 text-[9px]" style={{ color: "var(--accent)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Empty() {
  const { t } = useI18n();
  return (
    <div className="telemetry py-8 text-center text-[10px]" style={{ color: "var(--muted)" }}>
      {t("analytics.noDet")}
    </div>
  );
}
