"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { PageHeader, Spinner } from "@/components/ui";
import { api, type EvalResult } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

const PRIORITY_COLOR = ["", "var(--danger)", "var(--warn)", "var(--accent)", "var(--muted)", "var(--muted)"];

export default function WatchAreasPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [focus, setFocus] = useState<string | null>(null);
  const [evalMap, setEvalMap] = useState<Record<string, EvalResult>>({});
  const wa = useQuery({ queryKey: ["watch-areas"], queryFn: api.watchAreas });

  const evaluate = useMutation({
    mutationFn: (id: string) => api.evaluateWatchArea(id),
    onSuccess: (res, id) => {
      setEvalMap((m) => ({ ...m, [id]: res }));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const fc = useMemo(() => wa.data ?? { type: "FeatureCollection" as const, features: [] }, [wa.data]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <PageHeader title={t("nav.watchAreas")} />
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
    </div>
  );
}
