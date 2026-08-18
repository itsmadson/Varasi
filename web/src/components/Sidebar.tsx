"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";

type Item = { href: string; key: MsgKey; icon: keyof typeof Icon };
type Group = { label: MsgKey; items: Item[] };

const groups: Group[] = [
  {
    label: "nav.group.monitor",
    items: [
      { href: "/", key: "nav.dashboard", icon: "dashboard" },
      { href: "/detection", key: "nav.detection", icon: "detection" },
      { href: "/watch-areas", key: "nav.watchAreas", icon: "watch" },
      { href: "/permits", key: "nav.permits", icon: "permits" },
      { href: "/alerts", key: "nav.alerts", icon: "alerts" },
    ],
  },
  {
    label: "nav.group.analyze",
    items: [
      { href: "/analytics", key: "nav.analytics", icon: "analytics" },
      { href: "/library", key: "nav.library", icon: "library" },
      { href: "/jobs", key: "nav.jobs", icon: "jobs" },
    ],
  },
  {
    label: "nav.group.configure",
    items: [
      { href: "/projects", key: "nav.projects", icon: "projects" },
      { href: "/developers", key: "nav.developers", icon: "developers" },
      { href: "/settings", key: "nav.settings", icon: "settings" },
    ],
  },
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

      <nav className="flex-1 overflow-auto px-2.5 py-1">
        {groups.map((g) => (
          <div key={g.label} className="mb-2">
            <div className="eyebrow px-3 pb-1 pt-2">{t(g.label)}</div>
            {g.items.map((it) => {
              const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
              const IconC = Icon[it.icon];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="group relative my-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
                  style={{ color: active ? "var(--text)" : "var(--muted)", background: active ? "var(--panel-2)" : "transparent" }}
                >
                  <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full transition-opacity" style={{ background: "var(--accent)", opacity: active ? 1 : 0 }} />
                  <IconC className="h-[18px] w-[18px]" />
                  <span className="flex-1">{t(it.key)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="mx-2.5 mb-2 flex items-center justify-between rounded-md border px-3 py-2 text-[11px]"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        <span>{t("cmd.placeholder")}</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="telemetry border-t px-5 py-3 text-[9px]" style={{ color: "var(--muted)" }}>
        eoAPI · pgSTAC · titiler
      </div>
    </aside>
  );
}

function LogoMark() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="Varasi" className="h-9 w-9 rounded-md object-contain" />;
}
