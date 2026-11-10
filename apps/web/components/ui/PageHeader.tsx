"use client";

import type { ReactNode } from "react";

/**
 * En-tête de page commun : pastille d'icône lumineuse, titre (dégradé sur le mot-clé),
 * sous-titre, badges et actions. Utilisé par toutes les pages du tableau de bord.
 */
export function PageHeader({
  icon,
  title,
  highlight,
  subtitle,
  extra,
  badges,
}: {
  icon: ReactNode;
  /** Titre affiché en clair. */
  title: string;
  /** Mot-clé affiché en dégradé animé, après le titre. */
  highlight?: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="nb-fade-up" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0, fontSize: 22, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(167, 139, 250,0.9), rgba(139,92,246,0.9))",
            boxShadow: "0 10px 30px -8px rgba(139,92,246,0.7), inset 0 1px 0 rgba(255,255,255,0.3)",
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="nb-display" style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.15, color: "var(--nb-text)" }}>
              {title}
              {highlight && <> <span className="nb-gradient-text">{highlight}</span></>}
            </h1>
            {badges}
          </div>
          {subtitle && <div style={{ color: "var(--nb-text-2)", marginTop: 4, fontSize: 14 }}>{subtitle}</div>}
        </div>
      </div>
      {extra && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{extra}</div>}
    </div>
  );
}
