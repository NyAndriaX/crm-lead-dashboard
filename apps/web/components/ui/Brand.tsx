"use client";

import { useId, type ReactNode } from "react";

/** Logo : tête du robot de prospection (même dessin que le favicon app/icon.svg). */
export function BrandMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 64 64" width={size} height={size} aria-hidden
      style={{ flexShrink: 0, display: "block", filter: "drop-shadow(0 6px 14px rgba(124, 58, 237, 0.35))" }}
    >
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4dcff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}bg)`} />
      <rect x="30.5" y="9" width="3" height="9" rx="1.5" fill="#ffffff" />
      <circle className="nb-brand-antenna" cx="32" cy="9" r="4" fill="#c4b5fd" stroke="#ffffff" strokeWidth="2" />
      <rect x="7" y="27" width="6" height="14" rx="3" fill="#e4dcff" />
      <rect x="51" y="27" width="6" height="14" rx="3" fill="#e4dcff" />
      <rect x="11" y="17" width="42" height="35" rx="13" fill={`url(#${id}sh)`} />
      <rect x="16" y="23.5" width="32" height="20" rx="9" fill="#1e1b4b" />
      <g className="nb-brand-eyes">
        <rect x="22" y="29.5" width="7" height="8" rx="3.5" fill="#a78bfa" />
        <rect x="35" y="29.5" width="7" height="8" rx="3.5" fill="#a78bfa" />
      </g>
    </svg>
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
