"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

export default function ProjectsPage() {
  const { t } = useI18n();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });

  return (
    <div className="px-6 py-6">
      <PageHeader title={t("nav.projects")} />
      {projects.isLoading ? (
        <Spinner label={t("common.loading")} />
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(projects.data?.projects ?? []).map((p) => (
            <div key={p.id} className="panel p-4">
              <div className="flex items-start justify-between">
                <div className="font-600">{p.name}</div>
                <span className="chip">{p.collections.length} sets</span>
              </div>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                {p.description || "—"}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.collections.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(projects.data?.projects ?? []).length === 0 && (
            <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>
              No projects yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
