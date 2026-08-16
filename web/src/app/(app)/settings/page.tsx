"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth";
import { LOCALES } from "@/i18n/dict";

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { session, logout } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme((localStorage.getItem("varasi.theme") as "dark" | "light") || "dark");
  }, []);
  const applyTheme = (v: "dark" | "light") => {
    setTheme(v);
    localStorage.setItem("varasi.theme", v);
    document.documentElement.dataset.theme = v;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
      <PageHeader title={t("nav.settings")} subtitle={t("set.subtitle")} />

      {/* Account */}
      <section className="panel p-4">
        <div className="label mb-3">{t("set.account")}</div>
        <Row k={t("auth.email")} v={session?.email ?? "—"} />
        <Row k={t("set.role")} v={session?.role ?? "—"} />
        <Row k={t("set.org")} v={session?.org_id ?? "—"} mono />
      </section>

      {/* Preferences */}
      <section className="panel p-4">
        <div className="label mb-3">{t("set.preferences")}</div>

        <div className="mb-3">
          <div className="mb-1.5 text-xs" style={{ color: "var(--muted)" }}>{t("set.language")}</div>
          <div className="flex gap-1">
            {LOCALES.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className="chip flex-1 text-center"
                style={{
                  color: locale === l ? "var(--bg)" : "var(--muted)",
                  background: locale === l ? "var(--accent)" : "transparent",
                  borderColor: locale === l ? "var(--accent)" : "var(--border)",
                }}
              >
                {l === "en" ? "English" : "فارسی"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs" style={{ color: "var(--muted)" }}>{t("set.theme")}</div>
          <div className="flex gap-1">
            {(["dark", "light"] as const).map((v) => (
              <button
                key={v}
                onClick={() => applyTheme(v)}
                className="chip flex-1 text-center"
                style={{
                  color: theme === v ? "var(--bg)" : "var(--muted)",
                  background: theme === v ? "var(--accent)" : "transparent",
                  borderColor: theme === v ? "var(--accent)" : "var(--border)",
                }}
              >
                {v === "dark" ? t("set.dark") : t("set.light")}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Session */}
      <section className="panel p-4">
        <div className="label mb-3">{t("set.session")}</div>
        <button className="btn-ghost text-xs" onClick={logout} style={{ color: "var(--danger)" }}>
          {t("auth.signOut")}
        </button>
      </section>

      <div className="telemetry text-center text-[9px]" style={{ color: "var(--muted)" }}>
        Varasi · eoAPI · pgSTAC · titiler
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t py-2 text-xs first:border-t-0">
      <span style={{ color: "var(--muted)" }}>{k}</span>
      <span className={mono ? "telemetry" : ""} style={{ color: "var(--text)" }}>
        {v}
      </span>
    </div>
  );
}
