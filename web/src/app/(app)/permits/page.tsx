"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";
import type { GeoJSONFC } from "@/lib/api";

const km2 = (m2: number) => (m2 / 1e6).toFixed(2);

export default function PermitsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const permits = useQuery({ queryKey: ["permits"], queryFn: api.permits });
  const detections = useQuery({ queryKey: ["detections"], queryFn: () => api.detections() });
  const compliance = useQuery({ queryKey: ["compliance"], queryFn: api.permitCompliance });

  const upload = useMutation({
    mutationFn: (geojson: unknown) => api.createPermits(geojson),
    onSuccess: () => {
      setText("");
      setErr("");
      qc.invalidateQueries({ queryKey: ["permits"] });
      qc.invalidateQueries({ queryKey: ["compliance"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deletePermit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permits"] });
      qc.invalidateQueries({ queryKey: ["compliance"] });
    },
  });

  const submit = () => {
    try {
      const parsed = JSON.parse(text);
      setErr("");
      upload.mutate(parsed);
    } catch {
      setErr("Invalid JSON");
    }
  };
  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
  };

  const permitFC = useMemo(
    () => permits.data ?? { type: "FeatureCollection" as const, features: [] },
    [permits.data],
  );
  const c = compliance.data;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader title={t("permits.title")} subtitle={t("permits.subtitle")} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t lg:grid-cols-[380px_1fr]">
        <div className="min-h-0 space-y-4 overflow-auto border-e p-5">
          {/* Compliance tiles */}
          <div className="grid grid-cols-2 gap-2">
            <Tile label={t("permits.permitted")} value={c?.permitted_count ?? 0} sub={`${km2(c?.permitted_area_m2 ?? 0)} km²`} color="var(--accent)" />
            <Tile label={t("permits.violations")} value={c?.unpermitted_count ?? 0} sub={`${km2(c?.unpermitted_area_m2 ?? 0)} km²`} color="var(--danger)" />
            <Tile label={t("permits.noStart")} value={c?.no_start_count ?? 0} color="var(--warn)" />
            <Tile label={t("permits.count", { n: c?.permits_total ?? 0 }).replace(/\D*$/, "")} value={c?.permits_total ?? 0} />
          </div>

          {/* Upload */}
          <div className="panel space-y-2 p-3">
            <div className="label">{t("permits.upload")}</div>
            <p className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
              {t("permits.uploadHint")}
            </p>
            <textarea
              className="input h-28 font-mono text-[11px]"
              placeholder='{"type":"FeatureCollection","features":[…]}'
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={(e) => onFile(e.target.files?.[0])}
                className="text-[11px]"
              />
              <button className="btn ms-auto" disabled={!text || upload.isPending} onClick={submit}>
                {upload.isPending ? "…" : t("action.upload")}
              </button>
            </div>
            {(err || upload.isError) && (
              <p className="text-xs" style={{ color: "var(--danger)" }}>
                {err || (upload.error as Error)?.message}
              </p>
            )}
            {upload.isSuccess && (
              <p className="telemetry text-[10px]" style={{ color: "var(--accent)" }}>
                +{upload.data?.inserted} / {upload.data?.received}
              </p>
            )}
          </div>

          {/* Permit list */}
          <div>
            <div className="label mb-2">{t("permits.count", { n: permitFC.features.length })}</div>
            {permits.isLoading ? (
              <Spinner label={t("common.loading")} />
            ) : permitFC.features.length === 0 ? (
              <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>
                {t("permits.empty")}
              </div>
            ) : (
              <div className="space-y-1.5">
                {permitFC.features.map((f) => {
                  const p = (f.properties ?? {}) as Record<string, unknown>;
                  const noStart = Boolean(p.no_start);
                  return (
                    <div key={String(f.id)} className="panel flex items-center gap-2 p-2.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: noStart ? "var(--warn)" : "var(--accent)" }} />
                      <span className="min-w-0 flex-1 truncate text-xs">{String(p.permit_no ?? f.id)}</span>
                      <span className="chip !py-0" style={{ color: noStart ? "var(--warn)" : "var(--accent)", borderColor: noStart ? "var(--warn)" : "var(--accent)" }}>
                        {noStart ? t("permits.noStart") : "✓"}
                      </span>
                      <button className="btn-ghost !px-1.5" onClick={() => remove.mutate(String(f.id))} title={t("wa.delete")}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="relative min-h-0">
          <MapView footprints={permitFC} detections={detections.data as GeoJSONFC | undefined} className="absolute inset-0" />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="panel p-3">
      <div className="label truncate">{label}</div>
      <div className="telemetry mt-1 text-xl font-600" style={{ color: color ?? "var(--text)" }}>
        {value}
      </div>
      {sub && (
        <div className="telemetry mt-0.5 text-[9px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
