"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { SwipeMap } from "@/components/SwipeMap";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";
import { classBreakdown, downloadCSV, downloadGeoJSON, km2, printReport } from "@/lib/report";

const SEV_COLOR: Record<string, string> = { critical: "#c46a5a", warning: "#cb9a54", info: "#a8ae79" };
const CLASS_COLOR: Record<string, string> = {
  urban_growth: "#c46a5a",
  vegetation_loss: "#cb9a54",
  vegetation_gain: "#8c9258",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#757847",
};

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useI18n();
  const capture = useRef<(() => string | null) | null>(null);
  const [report, setReport] = useState<ReportModel | null>(null);

  const clsLabel = (c: string) => t(`class.${c}` as MsgKey);
  const sevLabel = (s: string) => t(`sev.${s}` as MsgKey);

  const q = useQuery({ queryKey: ["alert", id], queryFn: () => api.alert(id) });
  const ack = useMutation({
    mutationFn: () => api.ackAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert", id] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  if (q.isLoading) return <Spinner label={t("common.loading")} />;
  const d = q.data;
  if (!d) return <div className="p-6 text-sm">{t("alert.notFound")}</div>;

  const a = d.alert;
  const fc = d.detections;
  const scenes = d.scenes;
  const hasSwipe = scenes.collection && scenes.before && scenes.after;
  const breakdown = classBreakdown(fc);

  // Compose localized title/body from structured data (server text is English).
  const title = t("alert.titleTpl", { name: a.watch_area ?? "" });
  const body = t("alert.bodyTpl", {
    regions: d.stats.polygon_count,
    area: km2(d.stats.changed_area_m2),
    before: d.dates.before ?? "—",
    after: d.dates.after ?? "—",
  });

  const exportPdf = () => {
    setReport({
      kind: t("nav.alerts"),
      title,
      subtitle: a.watch_area ?? undefined,
      dateRange: a.created_at?.slice(0, 19).replace("T", " "),
      meta: [
        { label: t("alert.status"), value: sevLabel(a.severity) },
        { label: t("metric.score"), value: (a.score ?? 0).toFixed(0) },
        { label: t("alert.status"), value: a.acknowledged ? t("status.ack") : t("status.open") },
      ],
      mapImage: capture.current?.() ?? null,
      stats: [
        { label: t("metric.regions"), value: String(d.stats.polygon_count) },
        { label: t("metric.changedArea"), value: `${km2(d.stats.changed_area_m2)} km²` },
        { label: t("metric.classes"), value: String(breakdown.length) },
        { label: t("alert.status"), value: sevLabel(a.severity) },
      ],
      classBreakdown: breakdown,
      footerNote: body,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => printReport()));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader
          title={title}
          subtitle={body}
          actions={
            <button className="btn-ghost text-xs" onClick={() => router.push("/alerts")}>
              ← {t("common.back")}
            </button>
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[340px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          <div className="panel space-y-2 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[a.severity] ?? "var(--accent)" }} />
              <span className="chip !py-0" style={{ color: SEV_COLOR[a.severity], borderColor: SEV_COLOR[a.severity] }}>
                {sevLabel(a.severity)}
              </span>
              <span className="telemetry ms-auto text-[10px]" style={{ color: "var(--muted)" }}>
                {t("metric.score")} {(a.score ?? 0).toFixed(0)}
              </span>
            </div>
            <Row k={t("alert.watchArea")} v={a.watch_area ?? "—"} />
            <Row k={t("alert.raised")} v={a.created_at?.slice(0, 19).replace("T", " ")} />
            <Row k={t("alert.status")} v={a.acknowledged ? t("status.ack") : t("status.open")} />
          </div>

          <div className="panel space-y-2 p-3">
            <div className="label">{t("detect.change")}</div>
            <Row k={t("metric.regions")} v={d.stats.polygon_count} />
            <Row k={t("metric.changedArea")} v={`${km2(d.stats.changed_area_m2)} km²`} />
            <div className="label mt-2">{t("detect.byClass")}</div>
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
                {t("detect.noPolys")}
              </div>
            )}
          </div>

          <div className="panel space-y-2 p-3">
            <div className="label">{t("common.export")}</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button className="chip" onClick={exportPdf}>PDF</button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadGeoJSON(fc, `alert-${id.slice(0, 8)}`)}>GeoJSON</button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadCSV(fc, `alert-${id.slice(0, 8)}`)}>CSV</button>
            </div>
            {!a.acknowledged && (
              <button className="btn w-full" onClick={() => ack.mutate()} disabled={ack.isPending}>
                {ack.isPending ? "…" : t("alerts.ack")}
              </button>
            )}
          </div>
        </div>

        <div className="relative min-h-0">
          {hasSwipe ? (
            <SwipeMap
              before={{ collection: scenes.collection!, id: scenes.before! }}
              after={{ collection: scenes.collection!, id: scenes.after! }}
              detections={fc}
              captureRef={capture}
              className="absolute inset-0"
            />
          ) : (
            <MapView detections={fc} captureRef={capture} className="absolute inset-0" />
          )}
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
