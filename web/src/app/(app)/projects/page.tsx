"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n/LocaleProvider";

export default function ProjectsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api.createProject({ name, description, collections: picked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
      setDescription("");
      setPicked([]);
    },
  });

  const toggle = (c: string) =>
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <div className="px-6 py-6">
      <PageHeader
        title={t("nav.projects")}
        actions={
          <button className="btn" onClick={() => setOpen(true)}>
            + {t("proj.new")}
          </button>
        }
      />

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
              No projects yet — create one.
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("proj.new")}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div>
            <label className="label mb-1 block">{t("form.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label mb-1 block">{t("form.description")}</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label mb-1.5 block">{t("form.collections")}</label>
            <div className="flex flex-wrap gap-1.5">
              {collections.data?.collections.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="chip"
                  style={{
                    color: picked.includes(c.id) ? "var(--bg)" : "var(--muted)",
                    background: picked.includes(c.id) ? "var(--accent)" : "transparent",
                    borderColor: picked.includes(c.id) ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {c.id}
                </button>
              ))}
            </div>
          </div>
          {create.isError && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </button>
            <button type="submit" className="btn" disabled={!name || create.isPending}>
              {create.isPending ? t("action.saving") : t("action.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
