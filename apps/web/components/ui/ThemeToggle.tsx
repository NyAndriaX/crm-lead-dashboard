"use client";

import { Tooltip } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/components/ThemeProvider";

/** Bouton de bascule sombre / clair (icône qui pivote à chaque changement). */
export function ThemeToggle({ size = 38 }: { size?: number }) {
  const { mode, toggle } = useThemeMode();
  const dark = mode === "dark";
  return (
    <Tooltip title={dark ? "Passer en mode clair" : "Passer en mode sombre"}>
      <button
        type="button"
        aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
        onClick={toggle}
        style={{
          width: size, height: size, borderRadius: 12, cursor: "pointer", flexShrink: 0,
          border: "1px solid var(--nb-border)", background: "var(--nb-control)",
          color: dark ? "#fbbf24" : "#7c3aed", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span key={mode} style={{ display: "inline-flex", animation: "nb-pop-in 0.45s var(--nb-ease)" }}>
          {dark ? <SunOutlined /> : <MoonOutlined />}
        </span>
      </button>
    </Tooltip>
  );
}
