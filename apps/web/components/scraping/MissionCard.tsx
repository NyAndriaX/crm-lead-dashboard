"use client";

import { Button, Dropdown, Tooltip } from "antd";
import {
  AimOutlined, CalendarOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, EnvironmentOutlined,
  FileSearchOutlined, PlayCircleOutlined, ProfileOutlined,
} from "@ant-design/icons";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { isActive, MISSION_STATUS, type Mission } from "./types";

export function MissionCard({
  mission: m,
  onRun,
  onResults,
  onEdit,
  onLogs,
  onDelete,
}: {
  mission: Mission;
  onRun: () => void;
  onResults: () => void;
  onEdit: () => void;
  onLogs: () => void;
  onDelete: () => void;
}) {
  const st = MISSION_STATUS[m.status] ?? { color: palette.textTertiary, label: m.status };
  const active = isActive(m);
  const { pending, accepted, rejected } = m.bufferCounts;
  const total = pending + accepted + rejected;
  const queries = m.config.queries ?? [];
  const isAI = queries.length > 0 || !!m.config.targetProfile;

  return (
    <div
      className="nb-glass nb-lift"
      style={{
        borderRadius: 20, padding: 20, height: "100%", display: "flex", flexDirection: "column", gap: 14, position: "relative", overflow: "hidden",
        borderColor: active ? "rgba(167, 139, 250,0.55)" : undefined,
        boxShadow: active ? "0 0 0 1px rgba(167, 139, 250,0.35), 0 0 40px -10px rgba(167, 139, 250,0.6)" : undefined,
      }}
    >
      {active && <div className="nb-scanline" style={{ opacity: 0.6 }} />}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className={active ? "nb-pulse-dot" : undefined} style={{ color: st.color, width: 8, height: 8, borderRadius: "50%", background: st.color, display: "inline-block" }} />
            <span style={{ color: st.color, fontSize: 12, fontWeight: 600 }}>{st.label}</span>
            {isAI && <AIBadge>Plan IA</AIBadge>}
          </div>
          <div className="nb-display" style={{ color: "var(--nb-text-strong)", fontWeight: 600, fontSize: 17, lineHeight: 1.25 }}>{m.name}</div>
        </div>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "edit", icon: <EditOutlined />, label: "Modifier", onClick: onEdit },
              { key: "logs", icon: <ProfileOutlined />, label: "Journal d'exécution", onClick: onLogs },
              { type: "divider" },
              { key: "delete", danger: true, icon: <DeleteOutlined />, label: "Supprimer", onClick: onDelete },
            ],
          }}
        >
          <Button type="text" icon={<EllipsisOutlined />} />
        </Dropdown>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(queries.length ? queries.slice(0, 3) : [m.config.keywords]).map((q) => (
          <span key={q} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "rgba(167, 139, 250,0.1)", color: palette.cyan, border: "1px solid rgba(167, 139, 250,0.25)" }}>
            {q}
          </span>
        ))}
        {queries.length > 3 && <span style={{ fontSize: 12, color: palette.textTertiary, padding: "3px 4px" }}>+{queries.length - 3}</span>}
      </div>

      {m.config.targetProfile && (
        <Tooltip title={m.config.targetProfile}>
          <div style={{ fontSize: 12, color: palette.textSecondary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            <AimOutlined style={{ color: palette.violet }} /> {m.config.targetProfile}
          </div>
        </Tooltip>
      )}

      <div style={{ display: "flex", gap: 14, fontSize: 12, color: palette.textTertiary, flexWrap: "wrap" }}>
        <span><EnvironmentOutlined /> {m.config.location.city || m.config.location.country || "France"}</span>
        <span>{m.config.limit} fiches</span>
        {m.config.minFitScore != null && <span>Score ≥ {m.config.minFitScore}</span>}
        <span><CalendarOutlined /> {m.scheduleLabel}</span>
      </div>

      <div style={{ marginTop: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: palette.textTertiary }}>{total > 0 ? `${total} résultat(s)` : "Aucun résultat"}</span>
          {total > 0 && (
            <span className="nb-mono">
              <span style={{ color: palette.amber }}>{pending}</span>
              <span style={{ color: palette.textTertiary }}> · </span>
              <span style={{ color: palette.green }}>{accepted}</span>
              <span style={{ color: palette.textTertiary }}> · </span>
              <span style={{ color: palette.red }}>{rejected}</span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", height: 6, borderRadius: 6, overflow: "hidden", background: "rgba(148,163,184,0.08)" }}>
          {total > 0 && (
            <>
              <div style={{ width: `${(pending / total) * 100}%`, background: palette.amber }} />
              <div style={{ width: `${(accepted / total) * 100}%`, background: palette.green }} />
              <div style={{ width: `${(rejected / total) * 100}%`, background: palette.red, opacity: 0.7 }} />
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={active} disabled={active} onClick={onRun} style={{ flex: 1 }}>
          {active ? "En mission" : "Lancer"}
        </Button>
        <Button icon={<FileSearchOutlined />} onClick={onResults} style={{ flex: 1 }}>
          Résultats{pending > 0 ? ` (${pending})` : ""}
        </Button>
      </div>
    </div>
  );
}
