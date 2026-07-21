"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { PageHeader, Stat } from "@/components/ui";
import { api, type StacItem } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { GeoJSONFC } from "@/lib/api";

export default function DashboardPage() {
  const { t } = useI18n();
  const [basemap, setBasemap] = useState<"dark" | "light" | "satellite">("dark");
  const [opacity, setOpacity] = useState(1);
  const [selected, setSelected] = useState<StacItem | null>(null);

  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const search = useQuery({
    queryKey: ["scenes-all"],
    queryFn: () => api.search({ limit: 100 }),
  });
  const watch = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });

  const footprints: GeoJSONFC = useMemo(
    () => ({
      type: "FeatureCollection",
      features: (search.data?.features ?? []).map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { id: f.id, collection: f.collection },
      })),
    }),
    [search.data],
  );

  const scenes = search.data?.features ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-6">
        <PageHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("stat.scenes")} value={scenes.length} hint="pgSTAC" />
          <Stat label={t("stat.collections")} value={collections.data?.collections.length ?? 0} />
          <Stat label={t("stat.watchAreas")} value={watch.data?.features.length ?? 0} />
          <Stat label={t("stat.alerts")} value={0} />
        </div>
      </div>

      <div className="relative mt-5 min-h-0 flex-1 border-t">
        <MapView
          footprints={footprints}
          rasterItem={selected ? { collection: selected.collection, id: selected.id } : null}
          opacity={opacity}
          basemap={basemap}
          className="absolute inset-0"
        />

        {/* Floating glass control rail — the telemetry signature. */}
        <div className="glass absolute top-4 end-4 w-60 rounded-lg p-3.5">
          <div className="label mb-2">{t("map.basemap")}</div>
          <div className="mb-3 flex gap-1">
            {(["dark", "light", "satellite"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasemap(b)}
                className="chip flex-1 text-center"
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

          <div className="label mb-1">{t("map.opacity")}</div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />

          <div className="label mb-1 mt-3">{t("map.footprints")}</div>
          <div className="max-h-56 space-y-1 overflow-auto pe-1">
            {scenes.map((s) => {
              const active = selected?.id === s.id;
              const date = String(s.properties.datetime ?? "").slice(0, 10);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(active ? null : s)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs transition-colors"
                  style={{ background: active ? "var(--panel-2)" : "transparent", color: active ? "var(--text)" : "var(--muted)" }}
                >
                  <span className="truncate">{s.collection}</span>
                  <span className="telemetry text-[9px] opacity-70">{date}</span>
                </button>
              );
            })}
            {scenes.length === 0 && (
              <div className="telemetry py-2 text-[10px]" style={{ color: "var(--muted)" }}>
                {search.isLoading ? t("common.loading") : t("lib.empty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
