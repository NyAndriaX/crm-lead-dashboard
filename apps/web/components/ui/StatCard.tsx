"use client";

import type { ReactNode } from "react";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * Carte KPI « Nebula » : verre dépoli, icône lumineuse, compteur animé,
 * tendance optionnelle et mini-courbe (sparkline) optionnelle.
 */
export function StatCard({
  label,
  value,
  suffix,
  icon,
  color = "#8b5cf6",
  trend,
  hint,
  spark,
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: ReactNode;
  color?: string;
  trend?: number | null;
  hint?: ReactNode;
  spark?: number[];
  decimals?: number;
}) {
  return (
    <div className="nb-glass nb-lift" style={{ borderRadius: 18, padding: "20px 22px", height: "100%", position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%",
          background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="nb-eyebrow">{label}</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
            <AnimatedNumber value={value} decimals={decimals} className="nb-display nb-mono" style={{ fontSize: 30, fontWeight: 700, color: "var(--nb-text)" }} />
            {suffix && <span style={{ color: "var(--nb-text-3)", fontSize: 14 }}>{suffix}</span>}
          </div>
          {trend != null && (
            <div style={{ marginTop: 6, fontSize: 12, color: trend >= 0 ? "var(--nb-green)" : "var(--nb-red)" }}>
              {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)} % vs mois dernier
            </div>
          )}
          {hint && <div style={{ marginTop: 6, fontSize: 12, color: "var(--nb-text-2)" }}>{hint}</div>}
        </div>
        <div
          style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color,
            background: `${color}1f`, boxShadow: `0 0 0 1px ${color}40, 0 0 24px -4px ${color}80`,
          }}
        >
          {icon}
        </div>
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} color={color} />}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 200;
  const h = 36;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`);
  const id = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 36, marginTop: 14, display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: "nb-draw 1.6s var(--nb-ease) forwards" }} />
    </svg>
  );
}
