"use client";

/**
 * Graphiques légers en SVG (anneau, barres) au style « Nebula », animés à l'apparition.
 * Pour les analyses avancées, la page Analytics utilise @ant-design/charts (thème sombre).
 */
import { useState } from "react";

export type DonutSlice = { key: string; label: string; value: number; color: string };

export function DonutChart({ data, size = 220, centerLabel = "Total" }: { data: DonutSlice[]; size?: number; centerLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 80;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const active = data.find((d) => d.key === hover);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="22" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const gap = data.length > 1 ? 3 : 0;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={d.key}
                cx="100" cy="100" r={r} fill="none"
                stroke={d.color}
                strokeWidth={hover === d.key ? 28 : 22}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={offset}
                transform="rotate(-90 100 100)"
                style={{
                  transition: "stroke-width 0.25s",
                  filter: `drop-shadow(0 0 6px ${d.color}66)`,
                  cursor: "pointer",
                  animation: `nb-donut 1.2s var(--nb-ease) ${i * 0.08}s both`,
                }}
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        <text x="100" y="94" textAnchor="middle" fill="var(--nb-text-3)" fontSize="11" letterSpacing="2">
          {(active?.label ?? centerLabel).toUpperCase()}
        </text>
        <text x="100" y="122" textAnchor="middle" fill="var(--nb-text-strong)" fontSize="30" fontWeight="700" fontFamily="var(--font-grotesk), Space Grotesk, sans-serif">
          {active?.value ?? total}
        </text>
      </svg>
      <div style={{ display: "grid", gap: 8, minWidth: 160 }}>
        {data.map((d) => (
          <div
            key={d.key}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "6px 10px",
              borderRadius: 10, cursor: "default",
              background: hover === d.key ? "rgba(148,163,184,0.08)" : "transparent", transition: "background 0.2s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--nb-text-2)", fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              {d.label}
            </span>
            <span className="nb-mono" style={{ color: "var(--nb-text-strong)", fontSize: 13, fontWeight: 600 }}>
              {d.value}
              <span style={{ color: "var(--nb-text-3)", fontWeight: 400, marginLeft: 6 }}>
                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  height = 240,
  color = "#8b5cf6",
  accent = "#a78bfa",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  accent?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div style={{ height, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 12, padding: "8px 4px 0", position: "relative" }}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <div key={t} style={{ position: "absolute", left: 0, right: 0, bottom: `${t * 100}%`, borderTop: "1px dashed rgba(148,163,184,0.1)" }} />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          return (
            <div
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", position: "relative" }}
            >
              <span className="nb-mono" style={{ fontSize: 12, color: hover === i ? "var(--nb-text-strong)" : "var(--nb-text-2)", marginBottom: 6, transition: "color 0.2s" }}>
                {d.value}
              </span>
              <div
                style={{
                  width: "100%", maxWidth: 46, height: `${Math.max(h, 2)}%`, borderRadius: "10px 10px 4px 4px",
                  background: `linear-gradient(180deg, ${accent} 0%, ${color} 100%)`,
                  opacity: hover == null || hover === i ? 1 : 0.45,
                  boxShadow: hover === i ? `0 0 24px -2px ${accent}` : `0 0 14px -6px ${color}`,
                  transformOrigin: "bottom",
                  animation: `nb-grow 0.9s var(--nb-ease) ${i * 0.07}s both`,
                  transition: "opacity 0.2s, box-shadow 0.2s",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, padding: "10px 4px 0" }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
