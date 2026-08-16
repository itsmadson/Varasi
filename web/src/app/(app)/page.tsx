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
  const [basemap, setBasemap] = useState<"dark" | "light" | "satellite">("satellite");

  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const search = useQuery({ queryKey: ["scenes-all"], queryFn: () => api.search({ limit: 100 }) });
  const watch = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api.alerts(), refetchInterval: 10000 });
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });
  const models = useQuery({ queryKey: ["models"], queryFn: api.models });
  const compliance = useQuery({ queryKey: ["compliance"], queryFn: api.permitCompliance });
  const detections = useQuery({ queryKey: ["detections"], queryFn: () => api.detections() });

  const list = alerts.data?.alerts ?? [];
  const open = list.filter((a) => !a.acknowledged);
  const hottest = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const scenes = search.data?.features ?? [];
  const cat = models.data?.models ?? [];
  const ready = cat.filter((m) => m.available).length;
  const series = analytics.data?.series ?? [];
  const byClass = analytics.data?.by_class ?? [];
  const totals = analytics.data?.totals;
  const c = compliance.data;

  const footprints: GeoJSONFC = useMemo(
    () => ({ type: "FeatureCollection", features: scenes.map((f) => ({ type: "Feature", geometry: f.geometry, properties: { id: f.id } })) }),
    [scenes],
  );

  // Simple month-over-month trend on changed area (honest: derived from the series).
  const trend = useMemo(() => {
    if (series.length < 2) return null;
    const a = series[series.length - 1].area_m2, b = series[series.length - 2].area_m2;
    if (!b) return null;
    return Math.round(((a - b) / b) * 100);
  }, [series]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Hero / command band */}
      <div className="dash-hero px-6 py-6">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-1.5">{t("dash.console")}</div>
            <h1 className="text-2xl font-700" style={{ letterSpacing: "-0.02em" }}>
              {t("dash.title")}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {t("dash.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <HeroStat label={t("stat.alerts")} value={open.length} danger={open.length > 0} />
            <div className="h-9 w-px" style={{ background: "var(--border)" }} />
            <HeroStat label={t("stat.changedArea")} value={`${km2(totals?.changed_area_m2 ?? 0)} km²`} delta={trend} />
            <div className="h-9 w-px" style={{ background: "var(--border)" }} />
            <HeroStat label={t("permits.violations")} value={c?.unpermitted_count ?? 0} danger={(c?.unpermitted_count ?? 0) > 0} />
            <span className="chip ms-1 flex items-center gap-1.5">
              <span className="pulse-dot"><span /><span /></span>
              {t("dash.live")}
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-5 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t("stat.scenes")} value={scenes.length} hint="pgSTAC" />
        <Kpi label={t("stat.collections")} value={collections.data?.collections.length ?? 0} />
        <Kpi label={t("stat.watchAreas")} value={watch.data?.features.length ?? 0} />
        <Kpi label={t("stat.detections")} value={totals?.detections ?? 0} />
        <Kpi label={t("stat.changedArea")} value={`${km2(totals?.changed_area_m2 ?? 0)}`} hint="km²" />
        <Kpi label={t("stat.models")} value={`${ready}/${cat.length}`} />
      </div>

      {/* Map + live alert log */}
      <div className="grid grid-cols-1 gap-4 px-6 pt-5 lg:grid-cols-3">
        <div className="card relative h-[460px] overflow-hidden lg:col-span-2">
          <MapView footprints={footprints} detections={detections.data as GeoJSONFC | undefined} basemap={basemap} className="absolute inset-0" />
          <div className="glass absolute end-3 top-3 z-10 flex gap-1 rounded-lg p-1.5">
            {(["dark", "light", "satellite"] as const).map((b) => (
              <button key={b} onClick={() => setBasemap(b)} className="chip"
                style={{ color: basemap === b ? "var(--bg)" : "var(--muted)", background: basemap === b ? "var(--accent)" : "transparent", borderColor: basemap === b ? "var(--accent)" : "var(--border)" }}>
                {b}
              </button>
            ))}
          </div>
          {byClass.length > 0 && (
            <div className="glass absolute bottom-3 start-3 z-10 max-w-[60%] rounded-lg p-2.5">
              <div className="eyebrow mb-1.5">{t("dash.byClass")}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {byClass.slice(0, 6).map((k) => (
                  <span key={k.class} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[k.class] ?? "var(--accent)" }} />
                    {clsLabel(k.class)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card flex h-[460px] flex-col">
          <div className="card-head">
            <span className="flex items-center gap-2">
              <span className="pulse-dot"><span /><span /></span>
              <span className="label">{t("dash.alertStream")}</span>
            </span>
            <button className="chip" onClick={() => router.push("/alerts")}>{t("dash.viewAll")}</button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
            {list.length === 0 && (
              <div className="telemetry py-6 text-center text-[10px]" style={{ color: "var(--muted)" }}>{t("dash.noAlerts")}</div>
            )}
            {list.slice(0, 14).map((a) => (
              <div key={a.id} className="log-row" onClick={() => router.push(`/alerts/${a.id}`)} style={{ opacity: a.acknowledged ? 0.5 : 1 }}>
                <span className="log-time">{a.created_at?.slice(5, 10)}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV(a.severity) }} />
                <span className="min-w-0 flex-1 truncate text-[11px]">{a.watch_area ?? a.title}</span>
                <span className="telemetry text-[9px]" style={{ color: SEV(a.severity) }}>{(a.score ?? 0).toFixed(0)}</span>
              </div>
            ))}
          </div>
          {hottest.length > 0 && (
            <div className="border-t p-2.5">
              <div className="eyebrow mb-1.5">{t("dash.hottest")}</div>
              {hottest.slice(0, 3).map((a, i) => (
                <div key={a.id} className="flex items-center gap-2 py-0.5 text-[11px]" onClick={() => router.push(`/alerts/${a.id}`)} style={{ cursor: "pointer" }}>
                  <span className="telemetry w-3 text-[10px]" style={{ color: "var(--muted)" }}>{i + 1}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: SEV(a.severity) }} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--muted)" }}>{a.watch_area ?? a.title}</span>
                  <span className="telemetry">{(a.score ?? 0).toFixed(0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analytics band */}
      <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-4">
        <div className="card p-4 lg:col-span-2">
          <div className="eyebrow mb-3">{t("dash.overTime")}</div>
          {series.length === 0 ? <Empty /> : <AreaChart data={series.map((s) => s.area_m2)} labels={series.map((s) => s.month.slice(2))} />}
        </div>

        <div className="card p-4">
          <div className="eyebrow mb-3">{t("dash.byClass")}</div>
          {byClass.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {byClass.slice(0, 6).map((k) => {
                const max = Math.max(1, ...byClass.map((x) => x.area_m2));
                return (
                  <div key={k.class}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[k.class] ?? "var(--accent)" }} />{clsLabel(k.class)}</span>
                      <span className="telemetry" style={{ color: "var(--muted)" }}>{km2(k.area_m2)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--panel-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(k.area_m2 / max) * 100}%`, background: CLASS_COLOR[k.class] ?? "var(--accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="eyebrow mb-3">{t("permits.compliance")}</div>
          {c && c.permits_total > 0 ? (
            <div className="flex items-center gap-4">
              <Donut segments={[
                { v: c.permitted_count, color: "var(--accent)" },
                { v: c.unpermitted_count, color: "var(--danger)" },
                { v: c.no_start_count, color: "var(--warn)" },
              ]} total={c.permitted_count + c.unpermitted_count + c.no_start_count} center={`${c.permits_total}`} />
              <div className="flex-1 space-y-1.5">
                <Legend color="var(--danger)" label={t("permits.unpermitted")} v={c.unpermitted_count} />
                <Legend color="var(--warn)" label={t("permits.noStart")} v={c.no_start_count} />
                <Legend color="var(--accent)" label={t("permits.permitted")} v={c.permitted_count} />
              </div>
            </div>
          ) : (
            <button className="btn-ghost text-xs" onClick={() => router.push("/permits")}>{t("permits.empty")}</button>
          )}
        </div>
      </div>

      {/* Model zoo strip */}
      <div className="px-6 pb-6">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">{t("dash.modelZoo")}</span>
            <span className="telemetry text-[10px]" style={{ color: "var(--accent)" }}>{ready}/{cat.length} {t("dash.ready")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {cat.map((m) => (
              <div key={m.name} className="flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", opacity: m.available ? 1 : 0.5 }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.available ? "var(--accent)" : "var(--border)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-500">{m.title}</span>
                  <span className="telemetry text-[8px] uppercase" style={{ color: "var(--muted)" }}>{m.runtime} · {m.available ? t("dash.ready") : "gated"}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, delta, danger }: { label: string; value: React.ReactNode; delta?: number | null; danger?: boolean }) {
  return (
    <div className="text-end">
      <div className="telemetry text-xl font-700" style={{ color: danger ? "var(--danger)" : "var(--text)" }}>{value}</div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="eyebrow" style={{ letterSpacing: "0.12em" }}>{label}</span>
        {delta != null && (
          <span className={`telemetry text-[9px] ${delta >= 0 ? "delta-up" : "delta-down"}`}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta)}%</span>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-accent" />
      <div className="ps-2">
        <div className="label">{label}</div>
        <div className="telemetry mt-1.5 text-2xl font-600">{value}</div>
        {hint && <div className="telemetry mt-0.5 text-[9px]" style={{ color: "var(--accent)" }}>{hint}</div>}
      </div>
    </div>
  );
}

function AreaChart({ data, labels }: { data: number[]; labels: string[] }) {
  const w = 320, h = 120, pad = 6;
  const max = Math.max(1, ...data);
  const n = data.length;
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h + 14}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      <defs>
        <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#area-g)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      {data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2" fill="var(--accent)" />)}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={h + 10} fontSize="7" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">{l}</text>
      ))}
    </svg>
  );
}

function Donut({ segments, total, center }: { segments: { v: number; color: string }[]; total: number; center: string }) {
  const r = 34, sw = 10, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg viewBox="0 0 90 90" style={{ width: 90, height: 90 }}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="var(--panel-2)" strokeWidth={sw} />
      {total > 0 && segments.map((s, i) => {
        const len = (s.v / total) * C;
        const el = <circle key={i} cx="45" cy="45" r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 45 45)" strokeLinecap="butt" />;
        off += len;
        return el;
      })}
      <text x="45" y="49" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)" fontFamily="var(--font-mono)">{center}</text>
    </svg>
  );
}

function Legend({ color, label, v }: { color: string; label: string; v: number }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-1.5" style={{ color: "var(--muted)" }}><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>
      <span className="telemetry" style={{ color }}>{v}</span>
    </div>
  );
}

function Empty() {
  const { t } = useI18n();
  return <div className="telemetry py-8 text-center text-[10px]" style={{ color: "var(--muted)" }}>{t("analytics.noDet")}</div>;
}
