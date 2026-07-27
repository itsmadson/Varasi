"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DIR, dict, type Locale, type MsgKey } from "./dict";

type Ctx = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: MsgKey, params?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = (localStorage.getItem("varasi.locale") as Locale) || "en";
    setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = DIR[locale];
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("varasi.locale", l);
    setLocaleState(l);
  }, []);

  const toggleLocale = useCallback(
    () => setLocale(locale === "en" ? "fa" : "en"),
    [locale, setLocale],
  );

  const t = useCallback(
    (key: MsgKey, params?: Record<string, string | number>) => {
      let s: string = dict[locale][key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, dir: DIR[locale], t, setLocale, toggleLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}
