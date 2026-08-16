"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/LocaleProvider";
import { useToast } from "@/components/Toast";

const ENDPOINTS: { m: string; path: string; role: string; desc: string }[] = [
  { m: "GET", path: "/models", role: "viewer", desc: "List detection model backends" },
  { m: "POST", path: "/detections/run", role: "editor", desc: "Run change detection on a scene/date pair" },
  { m: "GET", path: "/detections", role: "viewer", desc: "List stored detections (GeoJSON)" },
  { m: "GET", path: "/watch-areas", role: "viewer", desc: "List watch areas" },
  { m: "POST", path: "/watch-areas", role: "editor", desc: "Create a watch area" },
  { m: "POST", path: "/watch-areas/{id}/evaluate", role: "editor", desc: "Evaluate a watch area now" },
  { m: "GET", path: "/alerts", role: "viewer", desc: "List alerts" },
  { m: "GET", path: "/permits/compliance", role: "viewer", desc: "Permit-compliance summary" },
  { m: "POST", path: "/permits", role: "editor", desc: "Upload permit parcels (GeoJSON)" },
  { m: "GET", path: "/analytics/summary", role: "viewer", desc: "Org analytics rollup" },
];

const ROLES = [
  { role: "viewer", can: "Read: list models, detections, alerts, analytics." },
  { role: "editor", can: "Viewer + write: run detection, create watch areas, upload permits." },
  { role: "admin", can: "Editor + manage API keys and members." },
];

export default function DevelopersPage() {
  const { t } = useI18n();
  const toast = useToast();
  const base = useMemo(() => (typeof window !== "undefined" ? `${location.origin}/api/v1` : "/api/v1"), []);
  const [mColor] = useState<Record<string, string>>({ GET: "var(--accent)", POST: "var(--warn)", DELETE: "var(--danger)" });

  const curl = `curl -s ${base}/detections/run \\
  -H "X-API-Key: vsk_xxx_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "before": {"collection":"sentinel-2-mashhad","item_id":"...","datetime":"2020-08-21"},
    "after":  {"collection":"sentinel-2-mashhad","item_id":"...","datetime":"2024-06-26"},
    "aoi": {"type":"Polygon","coordinates":[[[59.45,36.2],[59.78,36.2],[59.78,36.42],[59.45,36.42],[59.45,36.2]]]},
    "tags": ["new_construction","excavation"]
  }'`;

  const copy = (s: string) => { navigator.clipboard?.writeText(s); toast(t("set.copied")); };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <PageHeader title={t("dev.title")} subtitle={t("dev.subtitle")} />

      {/* Base URL + auth */}
      <section className="panel space-y-3 p-4">
        <div>
          <div className="label mb-1.5">{t("dev.baseUrl")}</div>
          <CodeLine text={base} onCopy={copy} />
        </div>
        <div>
          <div className="label mb-1.5">{t("dev.auth")}</div>
          <CodeLine text={`X-API-Key: vsk_xxx_your_key`} onCopy={copy} />
          <p className="telemetry mt-1 text-[10px]" style={{ color: "var(--muted)" }}>{t("dev.authHint")}</p>
        </div>
      </section>

      {/* Roles / scopes */}
      <section className="panel p-4">
        <div className="label mb-3">{t("dev.roles")}</div>
        <div className="space-y-2">
          {ROLES.map((r) => (
            <div key={r.role} className="flex items-start gap-3 text-xs">
              <span className="chip !py-0 uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>{r.role}</span>
              <span style={{ color: "var(--muted)" }}>{r.can}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Endpoints */}
      <section className="panel p-4">
        <div className="label mb-3">{t("dev.endpoints")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.m + e.path} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pe-2"><span className="telemetry font-600" style={{ color: mColor[e.m] }}>{e.m}</span></td>
                  <td className="py-1.5 pe-2"><code className="telemetry">{e.path}</code></td>
                  <td className="py-1.5 pe-2"><span className="chip !py-0" style={{ color: "var(--muted)" }}>{e.role}</span></td>
                  <td className="py-1.5" style={{ color: "var(--muted)" }}>{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Example */}
      <section className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">{t("dev.examples")}</span>
          <button className="chip" onClick={() => copy(curl)}>{t("dev.copy")}</button>
        </div>
        <pre className="overflow-x-auto rounded-lg border p-3 text-[10px] leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--bg)", fontFamily: "var(--font-mono)" }}>{curl}</pre>
      </section>

      <section className="panel flex items-center justify-between p-4">
        <div>
          <div className="label">{t("dev.swagger")}</div>
          <p className="telemetry mt-1 text-[10px]" style={{ color: "var(--muted)" }}>OpenAPI · Swagger UI</p>
        </div>
        <a className="btn" href="/docs" target="_blank" rel="noreferrer">/docs ↗</a>
      </section>
    </div>
  );
}

function CodeLine({ text, onCopy }: { text: string; onCopy: (s: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
      <code className="telemetry flex-1 truncate text-[11px]">{text}</code>
      <button className="chip" onClick={() => onCopy(text)}>copy</button>
    </div>
  );
}
