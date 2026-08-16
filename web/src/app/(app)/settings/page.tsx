"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { LOCALES } from "@/i18n/dict";
import { api } from "@/lib/api";

type Tab = "account" | "prefs" | "keys" | "members" | "audit";

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("account");
  const tabs: [Tab, string][] = [
    ["account", t("set.account")],
    ["prefs", t("set.preferences")],
    ["keys", t("set.apiKeys")],
    ["members", t("set.members")],
    ["audit", t("set.audit")],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <PageHeader title={t("nav.settings")} subtitle={t("set.subtitle")} />

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="relative px-3 py-2 text-xs"
            style={{ color: tab === id ? "var(--text)" : "var(--muted)" }}
          >
            {label}
            {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded" style={{ background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {tab === "account" && <Account />}
      {tab === "prefs" && <Preferences />}
      {tab === "keys" && <ApiKeys />}
      {tab === "members" && <Members />}
      {tab === "audit" && <Audit />}
    </div>
  );
}

function Account() {
  const { t } = useI18n();
  const { session, logout } = useAuth();
  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <div className="label mb-3">{t("set.account")}</div>
        <Row k={t("auth.email")} v={session?.email ?? "—"} />
        <Row k={t("set.role")} v={session?.role ?? "—"} />
        <Row k={t("set.org")} v={session?.org_id ?? "—"} mono />
      </section>
      <section className="panel p-4">
        <div className="label mb-3">{t("set.session")}</div>
        <button className="btn-ghost text-xs" onClick={logout} style={{ color: "var(--danger)" }}>{t("auth.signOut")}</button>
      </section>
    </div>
  );
}

function Preferences() {
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme((localStorage.getItem("varasi.theme") as "dark" | "light") || "dark"), []);
  const apply = (v: "dark" | "light") => {
    setTheme(v);
    localStorage.setItem("varasi.theme", v);
    document.documentElement.dataset.theme = v;
  };
  const Seg = <T extends string>({ opts, val, on }: { opts: [T, string][]; val: T; on: (v: T) => void }) => (
    <div className="flex gap-1">
      {opts.map(([v, l]) => (
        <button key={v} onClick={() => on(v)} className="chip flex-1 text-center"
          style={{ color: val === v ? "var(--bg)" : "var(--muted)", background: val === v ? "var(--accent)" : "transparent", borderColor: val === v ? "var(--accent)" : "var(--border)" }}>{l}</button>
      ))}
    </div>
  );
  return (
    <section className="panel space-y-4 p-4">
      <div>
        <div className="mb-1.5 text-xs" style={{ color: "var(--muted)" }}>{t("set.language")}</div>
        <Seg opts={LOCALES.map((l) => [l, l === "en" ? "English" : "فارسی"] as ["en" | "fa", string])} val={locale} on={setLocale} />
      </div>
      <div>
        <div className="mb-1.5 text-xs" style={{ color: "var(--muted)" }}>{t("set.theme")}</div>
        <Seg opts={[["dark", t("set.dark")], ["light", t("set.light")]]} val={theme} on={apply} />
      </div>
    </section>
  );
}

function ApiKeys() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");
  const [fresh, setFresh] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.apiKeys });
  const create = useMutation({
    mutationFn: () => api.createApiKey(name, role),
    onSuccess: (r) => {
      setFresh(r.key);
      setName("");
      toast(`${t("set.create")} · ${r.name}`);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => { toast(t("set.revoked")); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <div className="space-y-4">
      <section className="panel space-y-2 p-4">
        <div className="label">{t("set.newKey")}</div>
        <div className="flex gap-2">
          <input className="input" placeholder={t("set.keyName")} value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" style={{ width: 120 }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
          <button className="btn" disabled={!name || create.isPending} onClick={() => create.mutate()}>{t("set.create")}</button>
        </div>
        <p className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>{t("set.roleHint")}</p>
        {fresh && (
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--accent)" }}>
            <div className="telemetry mb-1 text-[9px]" style={{ color: "var(--warn)" }}>{t("set.keyOnce")}</div>
            <div className="flex items-center gap-2">
              <code className="telemetry flex-1 truncate text-[11px]">{fresh}</code>
              <button className="chip" onClick={() => { navigator.clipboard?.writeText(fresh); toast(t("set.copied")); }}>copy</button>
            </div>
          </div>
        )}
      </section>

      <section className="panel p-4">
        <div className="label mb-3">{t("set.apiKeys")}</div>
        {keys.isLoading ? <SkeletonRows /> : (keys.data?.keys.length ?? 0) === 0 ? (
          <Empty text={t("set.noKeys")} />
        ) : (
          <div className="space-y-1.5">
            {keys.data!.keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 border-t py-2 text-xs first:border-t-0">
                <span className="font-500">{k.name}</span>
                <span className="chip !py-0 uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>{k.role}</span>
                <code className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>{k.prefix}…</code>
                <span className="telemetry ms-auto text-[9px]" style={{ color: "var(--muted)" }}>
                  {t("set.lastUsed")}: {k.last_used_at ? String(k.last_used_at).slice(0, 10) : t("set.never")}
                </span>
                {k.revoked ? (
                  <span className="chip !py-0" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>{t("set.revoked")}</span>
                ) : (
                  <button className="chip" onClick={() => revoke.mutate(k.id)}>{t("set.revoke")}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Members() {
  const { t } = useI18n();
  const m = useQuery({ queryKey: ["members"], queryFn: api.members });
  return (
    <section className="panel p-4">
      <div className="label mb-3">{t("set.members")}</div>
      {m.isLoading ? <SkeletonRows /> : (m.data?.members.length ?? 0) === 0 ? <Empty text={t("set.noMembers")} /> : (
        <div className="space-y-1.5">
          {m.data!.members.map((mem) => (
            <div key={mem.email} className="flex items-center gap-3 border-t py-2 text-xs first:border-t-0">
              <span className="grid h-7 w-7 place-items-center rounded-full text-[10px]" style={{ background: "var(--panel-2)", color: "var(--accent)" }}>
                {mem.email.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1">{mem.full_name || mem.email}</span>
              <span className="chip !py-0 uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>{mem.role}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Audit() {
  const { t } = useI18n();
  const a = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  return (
    <section className="panel p-4">
      <div className="label mb-3">{t("set.audit")}</div>
      {a.isLoading ? <SkeletonRows /> : (a.data?.events.length ?? 0) === 0 ? <Empty text={t("set.noAudit")} /> : (
        <div className="space-y-0.5">
          {a.data!.events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 text-[11px]">
              <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>{String(e.created_at).slice(0, 16).replace("T", " ")}</span>
              <span className="telemetry" style={{ color: "var(--accent)" }}>{e.action}</span>
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--muted)" }}>{e.user}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t py-2 text-xs first:border-t-0">
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className={mono ? "telemetry" : ""}>{v}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="telemetry text-xs" style={{ color: "var(--muted)" }}>{text}</div>;
}
function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-6 w-full" />)}
    </div>
  );
}
