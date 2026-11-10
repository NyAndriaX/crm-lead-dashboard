"use client";

/**
 * Briques visuelles communes « Nebula » : panneau, pastille, anneau de score,
 * entonnoir, état vide, segment de progression. Utilisées par toutes les pages métier
 * pour un langage visuel unique.
 */
import type { CSSProperties, ReactNode } from "react";
import { Progress } from "antd";
import { palette } from "@/lib/theme";
import { ProspectorRobot } from "./ProspectorRobot";

/** Panneau en verre avec en-tête (icône lumineuse, titre, sous-titre, actions). */
export function Panel({
  icon,
  title,
  subtitle,
  extra,
  children,
  accent = palette.violet,
  padding = 22,
  style,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  accent?: string;
  padding?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`nb-glass ${className ?? ""}`} style={{ borderRadius: 20, padding, ...style }}>
      {(title || extra) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {icon && (
              <span
                style={{
                  width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: accent, background: `${accent}1f`, boxShadow: `0 0 0 1px ${accent}33`, fontSize: 16,
                }}
              >
                {icon}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="nb-display" style={{ fontWeight: 600, fontSize: 16, color: "var(--nb-text-strong)" }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12.5, color: "var(--nb-text-3)", marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

/** Pastille colorée (fond teinté + texte de la couleur), avec point lumineux optionnel. */
export function Chip({
  color,
  children,
  dot = false,
  pulse = false,
  size = "md",
  style,
}: {
  color: string;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
}) {
  return (
    <span
      className="nb-chip"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontWeight: 600,
        fontSize: size === "sm" ? 11 : 12, padding: size === "sm" ? "2px 8px" : "4px 10px", borderRadius: 999,
        ["--chip" as string]: color, background: `${color}1a`, border: `1px solid ${color}40`, ...style,
      }}
    >
      {dot && (
        <span className={pulse ? "nb-pulse-dot" : undefined} style={{ width: 7, height: 7, borderRadius: "50%", background: color, color, display: "inline-block" }} />
      )}
      {children}
    </span>
  );
}

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--nb-text-3)";
  if (score >= 70) return palette.green;
  if (score >= 45) return palette.amber;
  return palette.red;
}

/** Anneau de score 0-100 coloré. */
export function ScoreRing({ score, size = 44, color }: { score: number | null | undefined; size?: number; color?: string }) {
  if (score == null) return <span style={{ color: "var(--nb-text-3)", fontSize: 12 }}>—</span>;
  const c = color ?? scoreColor(score);
  return (
    <Progress
      type="circle"
      size={size}
      percent={Math.max(0, Math.min(100, score))}
      strokeColor={c}
      trailColor="rgba(148,163,184,0.16)"
      strokeWidth={9}
      format={() => <span className="nb-mono" style={{ color: c, fontWeight: 700, fontSize: Math.round(size * 0.3) }}>{Math.round(score)}</span>}
    />
  );
}

export type FunnelStep = { label: string; value: number; color: string; hint?: string };

/**
 * Entonnoir horizontal : chaque étape est une barre proportionnelle à la 1re,
 * avec le taux de passage depuis l'étape précédente.
 */
export function Funnel({ steps, height = 46 }: { steps: FunnelStep[]; height?: number }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {steps.map((s, i) => {
        const pct = Math.max(2, (s.value / top) * 100);
        const prev = i > 0 ? steps[i - 1]!.value : null;
        const rate = prev ? Math.round((s.value / prev) * 1000) / 10 : null;
        return (
          <div key={s.label} style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px", gap: 14, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nb-text-strong)" }}>{s.label}</div>
              {s.hint && <div style={{ fontSize: 11, color: "var(--nb-text-3)" }}>{s.hint}</div>}
            </div>
            <div style={{ height, borderRadius: 12, background: "rgba(148,163,184,0.08)", overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  width: `${pct}%`, height: "100%", borderRadius: 12,
                  background: `linear-gradient(90deg, ${s.color}, ${s.color}aa)`, boxShadow: `0 0 24px -6px ${s.color}`,
                  transformOrigin: "left", animation: `nb-grow-x 1s var(--nb-ease) ${i * 0.1}s both`,
                  display: "flex", alignItems: "center", paddingLeft: 14,
                }}
              >
                <span className="nb-mono" style={{ color: "#fff", fontWeight: 700, fontSize: 15, textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                  {s.value.toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
            <div className="nb-mono" style={{ textAlign: "right", fontSize: 12, color: rate == null ? "var(--nb-text-3)" : scoreColor(rate) }}>
              {rate == null ? "100 %" : `${rate} %`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** État vide illustré par le robot. */
export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "28px 16px", gap: 6 }}>
      <ProspectorRobot state="idle" size={110} />
      <div className="nb-display" style={{ fontSize: 18, fontWeight: 600, color: "var(--nb-text-strong)", marginTop: 6 }}>{title}</div>
      {description && <div style={{ color: "var(--nb-text-3)", maxWidth: 420, fontSize: 13 }}>{description}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/** Barre de progression segmentée (ex. envoyés / ouverts / cliqués). */
export function SegmentBar({ parts, height = 8 }: { parts: { value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ display: "flex", height, borderRadius: height, overflow: "hidden", background: "rgba(148,163,184,0.1)" }}>
      {total > 0 &&
        parts.map((p, i) => (
          <div key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color, transformOrigin: "left", animation: "nb-grow-x 0.9s var(--nb-ease) both" }} />
        ))}
    </div>
  );
}
