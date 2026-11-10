"use client";

import type { ReactNode } from "react";

/** Logo : orbe en dégradé avec anneau en rotation. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} aria-hidden>
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "conic-gradient(from 0deg, #a78bfa, #8b5cf6, #94a3b8, #a78bfa)",
          animation: "nb-spin 6s linear infinite",
          boxShadow: "0 0 24px -2px rgba(139,92,246,0.8)",
        }}
      />
      <div
        style={{
          position: "absolute", inset: 3, borderRadius: "50%", background: "#0a0f1e",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5}>
          <path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z" fill="url(#bm-g)" />
          <defs>
            <linearGradient id="bm-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

/** Pastille « IA Claude » en dégradé. */
export function AIBadge({ children = "IA", active = true }: { children?: ReactNode; active?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999,
        fontSize: 11, fontWeight: 600, letterSpacing: 0.3, whiteSpace: "nowrap",
        color: active ? "var(--nb-text-strong)" : "var(--nb-text-3)",
        background: active ? "linear-gradient(135deg, rgba(167, 139, 250,0.25), rgba(139,92,246,0.35))" : "rgba(148,163,184,0.1)",
        border: `1px solid ${active ? "rgba(139,92,246,0.55)" : "var(--nb-border)"}`,
      }}
    >
      <span style={{ fontSize: 12 }}>✦</span>
      {children}
    </span>
  );
}

/** Indicateur d'état (point pulsant + libellé). */
export function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok == null ? "var(--nb-text-3)" : ok ? "var(--nb-green)" : "var(--nb-red)";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 999,
        fontSize: 12, color: "var(--nb-text-2)", background: "rgba(148,163,184,0.08)", border: "1px solid var(--nb-border)",
      }}
    >
      <span className={ok ? "nb-pulse-dot" : undefined} style={{ color, width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
