"use client";

import { PageHeader } from "./ui";

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="relative h-full">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />
      <div className="relative px-6 py-6">
        <PageHeader title={title} />
        <div className="panel mt-6 max-w-lg p-6">
          <div className="chip mb-3 inline-block">On the roadmap</div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {note}
          </p>
        </div>
      </div>
    </div>
  );
}
