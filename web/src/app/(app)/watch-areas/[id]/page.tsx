"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { Sparkline } from "@/components/Sparkline";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";
import { classBreakdown, downloadCSV, downloadGeoJSON, km2, printReport } from "@/lib/report";
import { CLASS_COLOR } from "@/lib/changeClasses";
import type { GeoJSONFC } from "@/lib/api";

const SEV_COLOR: Record<string, string> = { critical: "#c46a5a", warning: "#cb9a54", info: "#a8ae79" };

export default function WatchAreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const clsLabel = (c: string) => t(`class.${c}` as MsgKey);
  const capture = useRef<(() => string | null) | null>(null);
  const [report, setReport] = useState<ReportModel | null>(null);

  const wa = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });
  const dets = useQuery({ queryKey: ["detections", id], queryFn: () => api.detections(id) });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api.alerts() });

  const feature = wa.data?.features.find((f) => String(f.id) === id);
  const fc: GeoJSONFC = dets.data ?? { type: "FeatureCollection", features: [] };
  const areaAlerts = (alerts.data?.alerts ?? []).filter((a) => a.watch_area_id === id);

  // Timeline: sum changed area per after_date day.
  const timeline = useMemo(() => {
    const by: Record<string, number> = {};
    for (const f of fc.features) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const day = String(p.after_date ?? "").slice(0, 10);
      if (!day) continue;
      by[day] = (by[day] ?? 0) + Number(p.area_m2 ?? 0);
    }
    return Object.entries(by)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, area]) => ({ label: day, value: area / 1e6 }));
  }, [fc]);

  const breakdown = classBreakdown(fc);

  if (wa.isLoading) return <Spinner label={t("common.loading")} />;
  if (!feature) return <div className="p-6 text-sm">{t("wa.notFound")}</div>;
  const p = (feature.properties ?? {}) as Record<string, unknown>;

  const single: GeoJSONFC = { type: "FeatureCollection", features: [feature as GeoJSON.Feature] };

  const exportPdf = () => {
    setReport({
      kind: t("nav.watchAreas"),
      title: String(p.name ?? "Watch area"),
      subtitle: `P${p.priority} · threshold ${Number(p.threshold ?? 0).toFixed(2)}`,
      dateRange: timeline.length ? `${timeline[0].label} → ${timeline[timeline.length - 1].label}` : undefined,
      meta: [
        { label: t("wa.cadence"), value: String(p.cadence ?? "on-ingest") },
        { label: t("wa.maxCloud"), value: `${p.max_cloud ?? 0}%` },
        { label: t("nav.alerts"), value: String(areaAlerts.length) },
      ],
      mapImage: capture.current?.() ?? null,
      stats: [
        { label: t("metric.detections"), value: String(fc.features.length) },
        { label: t("metric.changedArea"), value: `${km2(fc.features.reduce((s, f) => s + Number((f.properties as Record<string, unknown>)?.area_m2 ?? 0), 0))} km²` },
        { label: t("nav.alerts"), value: String(areaAlerts.length) },
        { label: t("metric.classes"), value: String(breakdown.length) },
      ],
      classBreakdown: breakdown,
      footerNote: String(p.name ?? ""),
    });
    requestAnimationFrame(() => requestAnimationFrame(() => printReport()));
  };

  const alertClasses = (p.alert_classes as string[] | undefined) ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader
          title={String(p.name ?? "Watch area")}
          subtitle={`P${p.priority} · θ ${Number(p.threshold ?? 0).toFixed(2)}`}
          actions={
            <button className="btn-ghost text-xs" onClick={() => router.push("/watch-areas")}>
              ← {t("common.back")}
            </button>
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[360px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          {/* Config */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("wa.config")}</div>
            <Row k={t("wa.cadence")} v={String(p.cadence ?? "on-ingest")} />
            <Row k={t("wa.maxCloud")} v={`${p.max_cloud ?? 0}%`} />
            <Row k={t("wa.alertOn")} v={alertClasses.length ? alertClasses.map(clsLabel).join("، ") : t("wa.anyClass")} />
            <div className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
              {t("wa.autoEval")}
            </div>
          </div>

          {/* Timeline */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("wa.timeline")}</div>
            <Sparkline points={timeline} width={300} height={56} />
          </div>

          {/* Class breakdown */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("detect.byClass")}</div>
            {breakdown.map((c) => (
              <div key={c.class} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[c.class] ?? "var(--accent)" }} />
                <span className="flex-1" style={{ color: "var(--muted)" }}>
                  {clsLabel(c.class)}
                </span>
                <span className="telemetry">{km2(c.area_m2)} km²</span>
              </div>
            ))}
            {breakdown.length === 0 && (
              <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
                {t("wa.noDet")}
              </div>
            )}
          </div>

          {/* Alert history */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("wa.alertHistory")}</div>
            {areaAlerts.length === 0 && (
              <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
                {t("wa.noAlerts")}
              </div>
            )}
            {areaAlerts.map((a) => (
              <button
                key={a.id}
                onClick={() => router.push(`/alerts/${a.id}`)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-start text-[11px] hover:bg-[var(--panel-2)]"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[a.severity] ?? "var(--accent)" }} />
                <span className="flex-1 truncate" style={{ color: "var(--muted)" }}>
                  {a.created_at?.slice(0, 10)}
                </span>
                <span className="telemetry">{(a.score ?? 0).toFixed(0)}</span>
              </button>
            ))}
          </div>

          {/* Export */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("common.export")}</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button className="chip" onClick={exportPdf}>
                PDF
              </button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadGeoJSON(fc, `wa-${id.slice(0, 8)}`)}>
                GeoJSON
              </button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadCSV(fc, `wa-${id.slice(0, 8)}`)}>
                CSV
              </button>
            </div>
          </div>
        </div>

        <div className="relative min-h-0">
          <MapView footprints={single} detections={fc} captureRef={capture} className="absolute inset-0" />
        </div>
      </div>

      {report && <ReportDoc model={report} />}
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
