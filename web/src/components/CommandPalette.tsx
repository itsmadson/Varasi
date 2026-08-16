"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";

type Cmd = { id: string; label: string; hint?: string; run: () => void };

// Global command palette — ⌘K / Ctrl+K. Enterprise navigation + quick actions.
export function CommandPalette() {
  const router = useRouter();
  const { t, toggleLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
    }
  }, [open]);

  const go = (path: string) => () => {
    router.push(path);
    setOpen(false);
  };
  const toggleTheme = () => {
    const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("varasi.theme", next);
    setOpen(false);
  };

  const nav: [MsgKey, string][] = [
    ["nav.dashboard", "/"],
    ["nav.detection", "/detection"],
    ["nav.watchAreas", "/watch-areas"],
    ["nav.permits", "/permits"],
    ["nav.alerts", "/alerts"],
    ["nav.analytics", "/analytics"],
    ["nav.library", "/library"],
    ["nav.jobs", "/jobs"],
    ["nav.projects", "/projects"],
    ["nav.settings", "/settings"],
  ];

  const cmds: Cmd[] = useMemo(() => {
    const list: Cmd[] = nav.map(([k, p]) => ({ id: p, label: t(k), hint: t("cmd.goto"), run: go(p) }));
    list.push({ id: "run", label: t("detect.run"), hint: t("cmd.action"), run: go("/detection") });
    list.push({ id: "wa", label: t("wa.new"), hint: t("cmd.action"), run: go("/watch-areas") });
    list.push({ id: "permit", label: t("permits.upload"), hint: t("cmd.action"), run: go("/permits") });
    list.push({ id: "lang", label: t("lang.toggle"), hint: t("cmd.action"), run: () => { toggleLocale(); setOpen(false); } });
    list.push({ id: "theme", label: t("theme.toggle"), hint: t("cmd.action"), run: toggleTheme });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const filtered = useMemo(
    () => (q ? cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())) : cmds),
    [q, cmds],
  );

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(v + 1, filtered.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); filtered[i]?.run(); }
          }}
          placeholder={t("cmd.placeholder")}
          className="w-full border-b bg-transparent px-4 py-3.5 text-sm outline-none"
          style={{ borderColor: "var(--border)" }}
        />
        <div className="max-h-80 overflow-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--muted)" }}>{t("cmd.empty")}</div>
          )}
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className="cmdk-item"
              data-active={idx === i}
              onMouseEnter={() => setI(idx)}
              onClick={() => c.run()}
            >
              <span className="flex-1">{c.label}</span>
              {c.hint && <span className="telemetry text-[9px] uppercase" style={{ color: "var(--muted)" }}>{c.hint}</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2" style={{ borderColor: "var(--border)" }}>
          <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>↑↓ · ↵ · esc</span>
          <span className="kbd">⌘K</span>
        </div>
      </div>
    </div>
  );
}
