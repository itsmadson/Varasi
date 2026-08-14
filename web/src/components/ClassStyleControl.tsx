"use client";

import { useCallback, useEffect, useState } from "react";
import { ALL_CLASSES, CATEGORIES, CLASS_COLOR } from "@/lib/changeClasses";
import { useI18n } from "@/i18n/LocaleProvider";
import type { MsgKey } from "@/i18n/dict";
import type { ModelInfo } from "@/lib/api";

// Backends whose tags overlap a category (plus generic "change"/"custom" ones).
function modelsForCategory(catalog: ModelInfo[], classes: string[]): ModelInfo[] {
  const set = new Set(classes);
  return catalog
    .filter((m) => m.tags.some((t) => set.has(t) || t === "change" || t === "custom"))
    .sort((a, b) => b.rank - a.rank);
}

export type ClassStyle = Record<string, { color: string; on: boolean }>;

const STORE = "varasi.classStyle.v1";

function initial(): ClassStyle {
  const s: ClassStyle = {};
  for (const c of ALL_CLASSES) s[c] = { color: CLASS_COLOR[c] ?? "#a8ae79", on: true };
  return s;
}

// useClassStyle holds per-class colour + on/off. With a storeKey it persists to
// localStorage (global detection palette); pass null for ephemeral form state
// (e.g. a watch-area creation form) that must not touch the shared palette.
export function useClassStyle(storeKey: string | null = STORE) {
  const [style, setStyle] = useState<ClassStyle>(initial);

  useEffect(() => {
    if (!storeKey) return;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setStyle({ ...initial(), ...(JSON.parse(raw) as ClassStyle) });
    } catch {}
  }, [storeKey]);

  const persist = useCallback(
    (next: ClassStyle) => {
      setStyle(next);
      if (!storeKey) return;
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {}
    },
    [storeKey],
  );

  const setColor = useCallback((cls: string, color: string) => persist({ ...style, [cls]: { ...style[cls], color } }), [style, persist]);
  const toggle = useCallback((cls: string) => persist({ ...style, [cls]: { ...style[cls], on: !style[cls].on } }), [style, persist]);
  const toggleCategory = useCallback(
    (classes: string[], on: boolean) => {
      const next = { ...style };
      for (const c of classes) next[c] = { ...next[c], on };
      persist(next);
    },
    [style, persist],
  );
  const reset = useCallback(() => persist(initial()), [persist]);

  const colors: Record<string, string> = {};
  for (const c of ALL_CLASSES) colors[c] = style[c]?.color ?? CLASS_COLOR[c];
  const enabled = new Set(ALL_CLASSES.filter((c) => style[c]?.on));

  return { style, colors, enabled, setColor, toggle, toggleCategory, reset };
}

// ClassStyleControl renders the categories, each collapsible, with a per-class
// checkbox (what to detect) and colour swatch (how to draw it).
export function ClassStyleControl({
  style,
  present,
  onColor,
  onToggle,
  onToggleCategory,
  onReset,
  catalog,
  modelByCategory,
  onModel,
}: {
  style: ClassStyle;
  present?: Set<string>; // classes actually in the current result (bolded)
  onColor: (cls: string, color: string) => void;
  onToggle: (cls: string) => void;
  onToggleCategory: (classes: string[], on: boolean) => void;
  onReset: () => void;
  catalog?: ModelInfo[];       // model zoo — enables a per-category model dropdown
  modelByCategory?: Record<string, string>;
  onModel?: (category: string, backend: string) => void;
}) {
  const { t } = useI18n();
  const [openCat, setOpenCat] = useState<Record<string, boolean>>({ construction: true, vegetation: true });

  return (
    <div className="panel space-y-1.5 p-3">
      <div className="flex items-center justify-between">
        <span className="label">{t("style.title")}</span>
        <button className="chip" onClick={onReset}>
          {t("style.reset")}
        </button>
      </div>

      {CATEGORIES.map((cat) => {
        const all = cat.classes.every((c) => style[c]?.on);
        const some = cat.classes.some((c) => style[c]?.on);
        const open = openCat[cat.key] ?? false;
        return (
          <div key={cat.key} className="rounded-md" style={{ background: "var(--bg)" }}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <input
                type="checkbox"
                checked={all}
                ref={(el) => {
                  if (el) el.indeterminate = some && !all;
                }}
                onChange={() => onToggleCategory(cat.classes, !all)}
                className="accent-[var(--accent)]"
              />
              <button className="flex flex-1 items-center justify-between text-start" onClick={() => setOpenCat((o) => ({ ...o, [cat.key]: !open }))}>
                <span className="text-xs font-600">{t(`cat.${cat.key}` as MsgKey)}</span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--muted)" }} fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {open && (
              <div className="space-y-1 px-2 pb-2">
                {catalog && onModel && (
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
                      {t("model.label")}
                    </span>
                    <select
                      className="input !py-1 !text-[11px]"
                      value={modelByCategory?.[cat.key] ?? "auto"}
                      onChange={(e) => onModel(cat.key, e.target.value)}
                    >
                      <option value="auto">{t("model.auto")}</option>
                      {modelsForCategory(catalog, cat.classes).map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.title} · {m.runtime}{m.available ? "" : " ⚠"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {cat.classes.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <input type="checkbox" checked={style[c]?.on ?? false} onChange={() => onToggle(c)} className="accent-[var(--accent)]" />
                    <input
                      type="color"
                      value={style[c]?.color ?? "#a8ae79"}
                      onChange={(e) => onColor(c, e.target.value)}
                      className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      style={{ appearance: "none" }}
                      aria-label={`color ${c}`}
                    />
                    <span
                      className="flex-1 text-[11px]"
                      style={{ color: present?.has(c) ? "var(--text)" : "var(--muted)", fontWeight: present?.has(c) ? 600 : 400 }}
                    >
                      {t(`class.${c}` as MsgKey)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="telemetry pt-1 text-[9px]" style={{ color: "var(--muted)" }}>
        {t("style.hint")}
      </div>
    </div>
  );
}
