"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; text: string };

const ToastCtx = createContext<{ push: (text: string, kind?: Kind) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, kind: Kind = "success") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const color = (k: Kind) => (k === "error" ? "var(--danger)" : k === "info" ? "var(--accent)" : "var(--accent)");

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 end-5 z-[200] flex flex-col gap-2" style={{ maxWidth: 340 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg"
            style={{ background: "var(--panel)", borderColor: "var(--border)", animation: "toast-in .18s ease" }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(t.kind) }} />
            <span className="flex-1">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  return ctx?.push ?? (() => {});
}
