"use client";

import type { ReactNode } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import {
  BarChartOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, FileTextOutlined, PauseCircleOutlined, RocketOutlined, TeamOutlined, CalendarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, ScoreRing } from "@/components/ui/Kit";

export type CampaignStats = { sent: number; opens: number; clicks: number; bounces: number; unsubscribes: number; replies: number };

export const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "#94a0bd" },
  SCHEDULED: { label: "Planifiée", color: palette.violet },
  SENDING: { label: "En cours d'envoi", color: palette.cyan },
  PAUSED: { label: "En pause", color: palette.amber },
  DONE: { label: "Terminée", color: palette.green },
  CANCELLED: { label: "Annulée", color: palette.red },
};

export function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function Metric({ label, value, color, children }: { label: string; value: string; color: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
      {children}
      <div style={{ fontSize: 11, color: "var(--nb-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div className="nb-mono" style={{ fontSize: 12, color, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function CampaignCard({
  name,
  status,
  template,
  segment,
  scheduledAt,
  aiPersonalize,
  target,
  stats,
  canEdit,
  canDelete,
  onOpen,
  onStats,
  onEdit,
  onLaunch,
  onPause,
  onDelete,
}: {
  name: string;
  status: string;
  template: string | null;
  segment: string | null;
  scheduledAt: string | null;
  aiPersonalize: boolean;
  target: number | null;
  stats: CampaignStats | null;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onStats: () => void;
  onEdit: () => void;
  onLaunch?: () => void;
  onPause?: () => void;
  onDelete: () => void;
}) {
  const st = CAMPAIGN_STATUS[status] ?? { label: status, color: "#94a0bd" };
  const sending = status === "SENDING";
  const sent = stats?.sent ?? 0;
  const progress = target && target > 0 ? Math.min(100, Math.round((sent / target) * 100)) : sent > 0 ? 100 : 0;
  const openRate = rate(stats?.opens ?? 0, sent);
  const clickRate = rate(stats?.clicks ?? 0, sent);
  const replyRate = rate(stats?.replies ?? 0, sent);

  return (
    <div
      className="nb-glass nb-lift"
      onClick={onOpen}
      style={{
        borderRadius: 20, padding: 20, height: "100%", display: "flex", flexDirection: "column", gap: 14, cursor: "pointer",
        position: "relative", overflow: "hidden",
        borderColor: sending ? `${palette.cyan}88` : undefined,
        boxShadow: sending ? `0 0 0 1px ${palette.cyan}55, 0 0 40px -12px ${palette.cyan}` : undefined,
      }}
    >
      <div aria-hidden style={{ position: "absolute", top: -60, right: -60, width: 160, height: 160, borderRadius: "50%", background: `radial-gradient(circle, ${st.color}30, transparent 70%)` }} />
      {sending && <div className="nb-scanline" style={{ opacity: 0.5 }} />}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", position: "relative" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <Chip color={st.color} dot pulse={sending}>{st.label}</Chip>
            {aiPersonalize && <AIBadge>Personnalisé</AIBadge>}
          </div>
          <div className="nb-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--nb-text-strong)", lineHeight: 1.25 }}>{name}</div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "stats", icon: <BarChartOutlined />, label: "Statistiques détaillées", onClick: onStats },
                { key: "edit", icon: <EditOutlined />, label: "Modifier", disabled: !canEdit, onClick: onEdit },
                { type: "divider" },
                { key: "delete", icon: <DeleteOutlined />, label: "Supprimer", danger: true, disabled: !canDelete, onClick: onDelete },
              ],
            }}
          >
            <Button type="text" icon={<EllipsisOutlined />} />
          </Dropdown>
        </div>
      </div>

      <div style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--nb-text-2)" }}>
        <span><FileTextOutlined style={{ color: palette.violet }} /> {template ?? "Aucun template"}</span>
        <span><TeamOutlined style={{ color: palette.cyan }} /> {segment ?? "Aucun segment"}</span>
        {scheduledAt && <span><CalendarOutlined style={{ color: palette.pink }} /> {status === "SCHEDULED" ? "Départ" : "Lancée"} le {dayjs(scheduledAt).format("DD/MM/YYYY à HH:mm")}</span>}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
          <span style={{ color: "var(--nb-text-3)" }}>Envoi</span>
          <span className="nb-mono" style={{ color: "var(--nb-text-strong)", fontWeight: 600 }}>
            {sent}{target ? ` / ${target}` : ""} <span style={{ color: "var(--nb-text-3)", fontWeight: 400 }}>· {progress} %</span>
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
          <div
            style={{
              width: `${progress}%`, height: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`,
              boxShadow: `0 0 14px ${palette.cyan}88`, transformOrigin: "left", animation: "nb-grow-x 1s var(--nb-ease) both",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 4px 4px", borderTop: "1px solid var(--nb-border)" }}>
        <Metric label="Ouverture" value={`${openRate} %`} color={palette.cyan}><ScoreRing score={sent ? openRate : null} size={46} color={palette.cyan} /></Metric>
        <Metric label="Clic" value={`${clickRate} %`} color={palette.violet}><ScoreRing score={sent ? clickRate : null} size={46} color={palette.violet} /></Metric>
        <Metric label="Réponse" value={`${replyRate} %`} color={palette.green}><ScoreRing score={sent ? replyRate : null} size={46} color={palette.green} /></Metric>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }} onClick={(e) => e.stopPropagation()}>
        {onLaunch && <Button type="primary" icon={<RocketOutlined />} onClick={onLaunch} style={{ flex: 1 }}>{status === "PAUSED" ? "Relancer" : "Lancer"}</Button>}
        {onPause && <Button icon={<PauseCircleOutlined />} onClick={onPause} style={{ flex: 1 }}>Pause</Button>}
        <Tooltip title="Statistiques détaillées">
          <Button icon={<BarChartOutlined />} onClick={onStats} style={{ flex: onLaunch || onPause ? undefined : 1 }}>{onLaunch || onPause ? "" : "Statistiques"}</Button>
        </Tooltip>
      </div>
    </div>
  );
}
