"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

const SEV_COLOR: Record<string, string> = {
  critical: "#c46a5a",
  warning: "#cb9a54",
  info: "#a8ae79",
};

export default function AlertsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [openOnly, setOpenOnly] = useState(false);

  const alerts = useQuery({
    queryKey: ["alerts", openOnly],
    queryFn: () => api.alerts(openOnly),
    refetchInterval: 8000,
  });

  const ack = useMutation({
    mutationFn: (id: string) => api.ackAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const list = alerts.data?.alerts ?? [];

  return (
    <div className="px-6 py-6">
      <PageHeader
        title={t("alerts.title")}
        subtitle={t("alerts.subtitle")}
        actions={
          <div className="flex gap-1">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                onClick={() => setOpenOnly(v)}
                className="chip"
                style={{
                  color: openOnly === v ? "var(--bg)" : "var(--muted)",
                  background: openOnly === v ? "var(--accent)" : "transparent",
                  borderColor: openOnly === v ? "var(--accent)" : "var(--border)",
                }}
              >
                {v ? t("alerts.open") : t("alerts.all")}
              </button>
            ))}
          </div>
        }
      />

      {alerts.isLoading ? (
        <Spinner label={t("common.loading")} />
      ) : list.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("alerts.empty")}
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {list.map((a) => (
            <div
              key={a.id}
              className="panel flex items-start gap-3 p-4"
              style={{ opacity: a.acknowledged ? 0.55 : 1 }}
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SEV_COLOR[a.severity] ?? "var(--accent)" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-600">{a.title}</span>
                  <span
                    className="chip !py-0"
                    style={{ color: SEV_COLOR[a.severity], borderColor: SEV_COLOR[a.severity] }}
                  >
                    {a.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {a.body}
                </p>
                <div className="telemetry mt-1.5 text-[9px]" style={{ color: "var(--muted)" }}>
                  {a.watch_area ?? "—"} · {a.created_at?.slice(0, 19).replace("T", " ")}
                </div>
              </div>
              {!a.acknowledged && (
                <button className="btn-ghost text-xs" onClick={() => ack.mutate(a.id)} disabled={ack.isPending}>
                  {t("alerts.ack")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
