"use client";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-700" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className="telemetry mt-2 text-2xl font-600" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {hint && (
        <div className="telemetry mt-1 text-[10px]" style={{ color: "var(--accent)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center py-16" style={{ color: "var(--muted)" }}>
      <span className="telemetry text-xs">{label ?? "…"}</span>
    </div>
  );
}
