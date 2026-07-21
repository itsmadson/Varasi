"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useI18n } from "@/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth";

export function Topbar() {
  const { t, toggleLocale, locale } = useI18n();
  const { session, logout } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("varasi.theme") as "dark" | "light") || "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("varasi.theme", next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 border-b px-5"
      style={{ background: "var(--panel)" }}
    >
      <div className="telemetry hidden text-[10px] sm:block" style={{ color: "var(--muted)" }}>
        {new Date().toISOString().slice(0, 10)} · UTC
      </div>

      <div className="flex-1" />

      <button onClick={toggleLocale} className="btn-ghost telemetry" title={t("lang.toggle")}>
        <Icon.globe className="h-4 w-4" />
        <span className="text-[11px]">{locale === "en" ? "فارسی" : "EN"}</span>
      </button>

      <button onClick={toggleTheme} className="btn-ghost" title={t("theme.toggle")}>
        {theme === "dark" ? <Icon.sun className="h-4 w-4" /> : <Icon.moon className="h-4 w-4" />}
      </button>

      {session && (
        <div className="flex items-center gap-3 border-s ps-3">
          <div className="hidden text-end leading-tight sm:block">
            <div className="text-xs">{session.email}</div>
            <div className="telemetry text-[9px] uppercase" style={{ color: "var(--accent)" }}>
              {session.role}
            </div>
          </div>
          <button onClick={logout} className="btn-ghost" title={t("auth.signOut")}>
            <Icon.logout className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
  );
}
