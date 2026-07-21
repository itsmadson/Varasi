"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";

type Item = { href: string; key: MsgKey; icon: keyof typeof Icon };

const items: Item[] = [
  { href: "/", key: "nav.dashboard", icon: "dashboard" },
  { href: "/library", key: "nav.library", icon: "library" },
  { href: "/detection", key: "nav.detection", icon: "detection" },
  { href: "/watch-areas", key: "nav.watchAreas", icon: "watch" },
  { href: "/alerts", key: "nav.alerts", icon: "alerts" },
  { href: "/analytics", key: "nav.analytics", icon: "analytics" },
  { href: "/jobs", key: "nav.jobs", icon: "jobs" },
  { href: "/projects", key: "nav.projects", icon: "projects" },
  { href: "/settings", key: "nav.settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-e md:flex" style={{ background: "var(--panel)" }}>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[15px] font-700" style={{ letterSpacing: "-0.01em" }}>
            {t("app.name")}
          </div>
          <div className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
            {t("app.tagline").toUpperCase()}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-1">
        {items.map((it, i) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const IconC = Icon[it.icon];
          return (
            <Link
              key={it.href}
              href={it.href}
              className="group relative my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              style={{
                color: active ? "var(--text)" : "var(--muted)",
                background: active ? "var(--panel-2)" : "transparent",
              }}
            >
              <span
                className="absolute inset-y-1.5 start-0 w-[3px] rounded-full transition-opacity"
                style={{ background: "var(--accent)", opacity: active ? 1 : 0 }}
              />
              <IconC className="h-[18px] w-[18px]" />
              <span className="flex-1">{t(it.key)}</span>
              <span className="telemetry text-[9px] opacity-40">{String(i + 1).padStart(2, "0")}</span>
            </Link>
          );
        })}
      </nav>

      <div className="telemetry border-t px-5 py-3 text-[9px]" style={{ color: "var(--muted)" }}>
        eoAPI · pgSTAC · titiler
      </div>
    </aside>
  );
}

function LogoMark() {
  return (
    <div
      className="grid h-9 w-9 place-items-center rounded-md"
      style={{ background: "var(--accent)", color: "var(--bg)" }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 17l6-6 4 4 8-8" /><circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="13" cy="15" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}
