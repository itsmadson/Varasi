"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MapView } from "@/components/MapView";
import { SwipeMap } from "@/components/SwipeMap";
import { ReportDoc, type ReportModel } from "@/components/ReportDoc";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
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
  const capture = useRef<(() => string | null) | null>(null);
  const [report, setReport] = useState<ReportModel | null>(null);

  const q = useQuery({ queryKey: ["alert", id], queryFn: () => api.alert(id) });
  const ack = useMutation({
    mutationFn: () => api.ackAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert", id] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  if (q.isLoading) return <Spinner label="loading" />;
  const d = q.data;
  if (!d) return <div className="p-6 text-sm">Alert not found.</div>;

  const a = d.alert;
  const fc = d.detections;
  const scenes = d.scenes;
  const hasSwipe = scenes.collection && scenes.before && scenes.after;
  const breakdown = classBreakdown(fc);

  const exportPdf = () => {
    setReport({
      kind: "Watch Area Alert",
      title: a.title,
      subtitle: a.watch_area ?? undefined,
      dateRange: a.created_at?.slice(0, 19).replace("T", " "),
      meta: [
        { label: "Severity", value: a.severity },
        { label: "Score", value: (a.score ?? 0).toFixed(0) },
        { label: "Status", value: a.acknowledged ? "acknowledged" : "open" },
      ],
      mapImage: capture.current?.() ?? null,
      stats: [
        { label: "Regions", value: String(d.stats.polygon_count) },
        { label: "Changed area", value: `${km2(d.stats.changed_area_m2)} km²` },
        { label: "Classes", value: String(breakdown.length) },
        { label: "Severity", value: a.severity },
      ],
      classBreakdown: breakdown,
      footerNote: `Alert report · ${a.body ?? ""}`,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => printReport()));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader
          title={a.title}
          subtitle={a.body ?? undefined}
          actions={
            <button className="btn-ghost text-xs" onClick={() => router.push("/alerts")}>
              ← back
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
                {a.severity}
              </span>
              <span className="telemetry ml-auto text-[10px]" style={{ color: "var(--muted)" }}>
                score {(a.score ?? 0).toFixed(0)}
              </span>
            </div>
            <Row k="Watch area" v={a.watch_area ?? "—"} />
            <Row k="Raised" v={a.created_at?.slice(0, 19).replace("T", " ")} />
            <Row k="Status" v={a.acknowledged ? "acknowledged" : "open"} />
          </div>

          <div className="panel space-y-2 p-3">
            <div className="label">Change</div>
            <Row k="Regions" v={d.stats.polygon_count} />
            <Row k="Changed area" v={`${km2(d.stats.changed_area_m2)} km²`} />
            <div className="label mt-2">By class</div>
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
                no polygons stored
              </div>
            )}
          </div>

          <div className="panel space-y-2 p-3">
            <div className="label">Export</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button className="chip" onClick={exportPdf}>
                PDF
              </button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadGeoJSON(fc, `alert-${id.slice(0, 8)}`)}>
                GeoJSON
              </button>
              <button className="chip" disabled={fc.features.length === 0} onClick={() => downloadCSV(fc, `alert-${id.slice(0, 8)}`)}>
                CSV
              </button>
            </div>
            {!a.acknowledged && (
              <button className="btn w-full" onClick={() => ack.mutate()} disabled={ack.isPending}>
                {ack.isPending ? "…" : "Acknowledge"}
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
