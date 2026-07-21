"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, Spinner, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

const CLASS_COLOR: Record<string, string> = {
  urban_growth: "#c46a5a",
  vegetation_loss: "#cb9a54",
  vegetation_gain: "#8c9258",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#757847",
};

const km2 = (m2: number) => (m2 / 1e6).toFixed(2);

export default function AnalyticsPage() {
  const { t } = useI18n();
  const a = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });

  if (a.isLoading) return <Spinner label={t("common.loading")} />;
  const d = a.data;
  if (!d) return null;

  const maxClass = Math.max(1, ...d.by_class.map((c) => c.area_m2));
  const maxMonth = Math.max(1, ...d.series.map((s) => s.area_m2));

  return (
    <div className="space-y-6 px-6 py-6">
      <PageHeader title={t("nav.analytics")} subtitle="Detected change across your organization." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Detections" value={d.totals.detections} />
        <Stat label="Changed area" value={`${km2(d.totals.changed_area_m2)} km²`} />
        <Stat label={t("stat.watchAreas")} value={d.totals.watch_areas} />
        <Stat label={t("stat.alerts")} value={d.totals.open_alerts} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Change-class breakdown */}
        <div className="panel p-5">
          <div className="label mb-4">Change by class</div>
          <div className="space-y-3">
            {d.by_class.length === 0 && (
              <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>
                No detections yet. Run change detection to populate.
              </div>
            )}
            {d.by_class.map((c) => (
              <div key={c.class}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[c.class] ?? "var(--accent)" }} />
                    {c.class.replace("_", " ")}
                  </span>
                  <span className="telemetry" style={{ color: "var(--muted)" }}>
                    {km2(c.area_m2)} km² · {c.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--panel-2)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(c.area_m2 / maxClass) * 100}%`, background: CLASS_COLOR[c.class] ?? "var(--accent)" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly changed-area time series */}
        <div className="panel p-5">
          <div className="label mb-4">Changed area over time</div>
          {d.series.length === 0 ? (
            <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>
              No time series yet.
            </div>
          ) : (
            <div className="flex h-48 items-end gap-2">
              {d.series.map((s) => (
                <div key={s.month} className="flex flex-1 flex-col items-center gap-1.5">
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
      </div>
    </div>
  );
}
