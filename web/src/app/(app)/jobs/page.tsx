"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

const STATUS_COLOR: Record<string, string> = {
  queued: "var(--muted)",
  running: "var(--accent)",
  succeeded: "var(--accent-strong)",
  failed: "var(--danger)",
  cancelled: "var(--muted)",
};

export default function JobsPage() {
  const { t } = useI18n();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: 5000 });

  return (
    <div className="px-6 py-6">
      <PageHeader title={t("nav.jobs")} />
      <div className="panel mt-5 overflow-hidden">
        {jobs.isLoading ? (
          <Spinner label={t("common.loading")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="label border-b text-start">
                <th className="px-4 py-2.5 text-start font-500">Kind</th>
                <th className="px-4 py-2.5 text-start font-500">Status</th>
                <th className="px-4 py-2.5 text-start font-500">Progress</th>
                <th className="px-4 py-2.5 text-start font-500">Created</th>
              </tr>
            </thead>
            <tbody>
              {(jobs.data?.jobs ?? []).map((j) => (
                <tr key={j.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2.5">{j.kind}</td>
                  <td className="telemetry px-4 py-2.5 text-xs uppercase" style={{ color: STATUS_COLOR[j.status] }}>
                    {j.status}
                  </td>
                  <td className="telemetry px-4 py-2.5 text-xs">{Math.round(j.progress * 100)}%</td>
                  <td className="telemetry px-4 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                    {j.created_at.slice(0, 19).replace("T", " ")}
                  </td>
                </tr>
              ))}
              {(jobs.data?.jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="telemetry px-4 py-8 text-center text-xs" style={{ color: "var(--muted)" }}>
                    No jobs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
