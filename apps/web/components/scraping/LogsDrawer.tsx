"use client";

import { Drawer, Empty } from "antd";
import { palette } from "@/lib/theme";
import type { Mission } from "./types";

function lineColor(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("erreur") || l.includes("error") || l.includes(" ko")) return palette.red;
  if (l.includes("analyse ia") || l.includes("plan ia") || l.includes("cible")) return palette.violet;
  if (l.includes("terminé") || l.includes("injecté") || l.includes("buffer")) return palette.green;
  if (l.includes("filtre") || l.includes("quota")) return palette.amber;
  return "#cbd5e1"; // console toujours sombre, quel que soit le thème
}

/** Journal d'exécution d'une mission, façon terminal. */
export function LogsDrawer({ mission, onClose }: { mission: Mission | null; onClose: () => void }) {
  const lines = (mission?.logs ?? "").split("\n").filter(Boolean);
  return (
    <Drawer open={!!mission} onClose={onClose} width={680} title={<span className="nb-display" style={{ fontWeight: 600 }}>Journal — {mission?.name}</span>}>
      {lines.length === 0 ? (
        <Empty description="Aucun log pour cette mission" />
      ) : (
        <div
          className="nb-mono"
          style={{ background: "#0b1020", color: "#cbd5e1", border: "1px solid var(--nb-border)", borderRadius: 16, padding: 18, fontSize: 12.5, lineHeight: 1.8 }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[palette.red, palette.amber, palette.green].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
          </div>
          {lines.map((l, i) => (
            <div key={i} style={{ color: lineColor(l), animation: `nb-slide-in 0.35s var(--nb-ease) ${Math.min(i, 30) * 0.02}s both` }}>
              <span style={{ color: "#64748b", userSelect: "none" }}>{String(i + 1).padStart(3, " ")} </span>
              {l}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
