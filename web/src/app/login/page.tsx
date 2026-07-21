"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useI18n } from "@/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { t, toggleLocale, locale } = useI18n();
  const { login, session } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      await login(email, password);
      router.replace("/");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute -top-40 start-1/2 h-96 w-96 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, #a8ae7933, transparent 70%)" }}
      />

      <button
        onClick={toggleLocale}
        className="btn-ghost telemetry absolute top-5 end-5 text-[11px]"
      >
        <Icon.globe className="h-4 w-4" />
        {locale === "en" ? "فارسی" : "EN"}
      </button>

      <div className="panel relative w-full max-w-sm p-7" style={{ background: "var(--panel)" }}>
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md" style={{ background: "var(--accent)", color: "var(--bg)" }}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-700">{t("app.name")}</div>
            <div className="telemetry text-[9px]" style={{ color: "var(--muted)" }}>
              {t("app.tagline").toUpperCase()}
            </div>
          </div>
        </div>

        <h1 className="mb-1 text-base font-600">{t("auth.signIn")}</h1>
        <p className="mb-5 text-sm" style={{ color: "var(--muted)" }}>
          {t("auth.subtitle")}
        </p>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="label mb-1 block">{t("auth.email")}</label>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label mb-1 block">{t("auth.password")}</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {t("auth.error")}
            </p>
          )}
          <button className="btn w-full" disabled={busy} type="submit">
            {busy ? t("common.loading") : t("auth.signInCta")}
          </button>
        </form>
      </div>
    </div>
  );
}
