"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { Sparkline } from "@/components/Sparkline";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { classBreakdown, downloadCSV, downloadGeoJSON, km2, printReport } from "@/lib/report";
import type { GeoJSONFC } from "@/lib/api";

const SEV_COLOR: Record<string, string> = { critical: "#c46a5a", warning: "#cb9a54", info: "#a8ae79" };
const CLASS_COLOR: Record<string, string> = {
  urban_growth: "#c46a5a",
  vegetation_loss: "#cb9a54",
  vegetation_gain: "#8c9258",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#757847",
};

export default function WatchAreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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

  if (wa.isLoading) return <Spinner label="loading" />;
  if (!feature) return <div className="p-6 text-sm">Watch area not found.</div>;
  const p = (feature.properties ?? {}) as Record<string, unknown>;

  const single: GeoJSONFC = { type: "FeatureCollection", features: [feature as GeoJSON.Feature] };

  const exportPdf = () => {
    setReport({
      kind: "Watch Area",
      title: String(p.name ?? "Watch area"),
      subtitle: `P${p.priority} · threshold ${Number(p.threshold ?? 0).toFixed(2)}`,
      dateRange: timeline.length ? `${timeline[0].label} → ${timeline[timeline.length - 1].label}` : undefined,
      meta: [
        { label: "Cadence", value: String(p.cadence ?? "on-ingest") },
        { label: "Max cloud", value: `${p.max_cloud ?? 0}%` },
        { label: "Alerts", value: String(areaAlerts.length) },
      ],
      mapImage: capture.current?.() ?? null,
      stats: [
        { label: "Detections", value: String(fc.features.length) },
        { label: "Changed area", value: `${km2(fc.features.reduce((s, f) => s + Number((f.properties as Record<string, unknown>)?.area_m2 ?? 0), 0))} km²` },
        { label: "Alerts", value: String(areaAlerts.length) },
        { label: "Classes", value: String(breakdown.length) },
      ],
      classBreakdown: breakdown,
      footerNote: `Watch-area report · ${String(p.name ?? "")}`,
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
              ← back
            </button>
          }
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[360px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          {/* Config */}
          <div className="panel space-y-2 p-3">
            <div className="label">Config</div>
            <Row k="Cadence" v={String(p.cadence ?? "on-ingest")} />
            <Row k="Max cloud" v={`${p.max_cloud ?? 0}%`} />
            <Row k="Alert on" v={alertClasses.length ? alertClasses.join(", ") : "any class"} />
            <div className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
              Evaluated automatically when new imagery is ingested.
            </div>
          </div>

          {/* Timeline */}
          <div className="panel space-y-2 p-3">
            <div className="label">Change timeline · km²</div>
            <Sparkline points={timeline} width={300} height={56} />
          </div>

          {/* Class breakdown */}
          <div className="panel space-y-2 p-3">
            <div className="label">By class</div>
            {breakdown.map((c) => (
              <div key={c.class} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[c.class] ?? "var(--accent)" }} />
                <span className="flex-1" style={{ color: "var(--muted)" }}>
                  {c.class.replace("_", " ")}
                </span>
                <span className="telemetry">{km2(c.area_m2)} km²</span>
              </div>
            ))}
            {breakdown.length === 0 && (
              <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
                no detections yet
              </div>
            )}
          </div>

          {/* Alert history */}
          <div className="panel space-y-2 p-3">
            <div className="label">Alert history</div>
            {areaAlerts.length === 0 && (
              <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
                no alerts
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
            <div className="label">Export</div>
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
