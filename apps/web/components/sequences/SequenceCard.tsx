"use client";

import { Button, Dropdown, Tooltip } from "antd";
import {
  DeleteOutlined, EditOutlined, EllipsisOutlined, MailOutlined, PauseOutlined, PlayCircleOutlined, StopOutlined, TeamOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { palette } from "@/lib/theme";
import { Chip, SegmentBar } from "@/components/ui/Kit";

export type SequenceStep = { delayDays: number; stopOnReply?: boolean; aiPersonalize?: boolean; subject?: string | null };

export type SequenceStat = {
  active: number;
  completed: number;
  stopped: number;
  totalSent: number;
  stoppedReasons: Record<string, number>;
  nextScheduledAt: string | null;
};

const STOPPED_REASON: Record<string, { label: string; color: string }> = {
  reply: { label: "Réponse reçue", color: palette.green },
  unsubscribed: { label: "Désinscription", color: palette.red },
  hard_bounce: { label: "Hard bounce", color: palette.amber },
  blacklisted: { label: "Blacklist", color: palette.red },
  lead_deleted: { label: "Lead supprimé", color: "#94a0bd" },
  lead_missing: { label: "Lead introuvable", color: "#94a0bd" },
};

function timeUntil(iso: string | null): string {
  if (!iso) return "aucun envoi planifié";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "envoi imminent";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `prochain envoi dans ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `prochain envoi dans ${h} h`;
  return `prochain envoi dans ${Math.floor(h / 24)} j`;
}

/** Frise des étapes : J+n cumulés, IA et arrêt-sur-réponse, flux animé quand la séquence est active. */
function StepTimeline({ steps, active }: { steps: SequenceStep[]; active: boolean }) {
  let day = 0;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 0, padding: "6px 2px 0" }}>
      <div
        aria-hidden
        style={{
          position: "absolute", left: 20, right: 20, top: 25, height: 2, borderRadius: 2,
          background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`, opacity: 0.45,
        }}
      />
      {active && (
        <div
          aria-hidden
          style={{
            position: "absolute", top: 21, left: 20, width: 10, height: 10, borderRadius: "50%", background: palette.cyan,
            boxShadow: `0 0 12px ${palette.cyan}`, animation: "nb-travel 3.2s ease-in-out infinite",
          }}
        />
      )}
      {steps.map((s, i) => {
        day += s.delayDays ?? 0;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative", minWidth: 0 }}>
            <Tooltip title={s.subject || `Étape ${i + 1}`}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 15, position: "relative",
                  background: `linear-gradient(135deg, ${i === 0 ? palette.violet : palette.indigo}, ${palette.cyan})`,
                  boxShadow: `0 0 18px -4px ${palette.violet}`, animation: `nb-pop-in 0.5s var(--nb-ease) ${i * 0.08}s both`,
                }}
              >
                <MailOutlined />
                {s.aiPersonalize && (
                  <span style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: palette.pink, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 8px ${palette.pink}` }}>
                    ✦
                  </span>
                )}
              </div>
            </Tooltip>
            <span className="nb-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--nb-text-strong)" }}>J+{day}</span>
            {s.stopOnReply !== false && <span style={{ fontSize: 10, color: "var(--nb-text-3)" }}><StopOutlined /> si réponse</span>}
          </div>
        );
      })}
    </div>
  );
}

export function SequenceCard({
  name,
  steps,
  isPaused,
  stat,
  onOpen,
  onLeads,
  onEdit,
  onTogglePause,
  onDelete,
}: {
  name: string;
  steps: SequenceStep[];
  isPaused: boolean;
  stat: SequenceStat | null;
  onOpen: () => void;
  onLeads: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  const total = (stat?.active ?? 0) + (stat?.completed ?? 0) + (stat?.stopped ?? 0);
  const reasons = Object.entries(stat?.stoppedReasons ?? {}).filter(([, n]) => n > 0);
  const color = isPaused ? palette.amber : palette.green;

  return (
    <div className="nb-glass nb-lift" onClick={onOpen} style={{ cursor: "pointer", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 16, height: "100%", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", top: -70, left: -50, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${palette.violet}26, transparent 70%)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, position: "relative" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <Chip color={color} dot pulse={!isPaused}>{isPaused ? "En pause" : "Active"}</Chip>
            <Chip color={palette.violet}>{steps.length} étape{steps.length > 1 ? "s" : ""}</Chip>
          </div>
          <div className="nb-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--nb-text-strong)" }}>{name}</div>
          <div style={{ fontSize: 12, color: "var(--nb-text-3)", marginTop: 4 }}>
            <ClockCircleOutlined /> {isPaused ? "séquence en pause" : timeUntil(stat?.nextScheduledAt ?? null)}
          </div>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "edit", icon: <EditOutlined />, label: "Modifier", onClick: onEdit },
              { type: "divider" },
              { key: "delete", icon: <DeleteOutlined />, label: "Supprimer", danger: true, onClick: onDelete },
            ],
          }}
        >
          <Button type="text" icon={<EllipsisOutlined />} />
        </Dropdown>
        </span>
      </div>

      <StepTimeline steps={steps} active={!isPaused} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "12px 0 0", borderTop: "1px solid var(--nb-border)" }}>
        {[
          { label: "En cours", value: stat?.active ?? 0, color: palette.cyan },
          { label: "Terminés", value: stat?.completed ?? 0, color: palette.violet },
          { label: "Arrêtés", value: stat?.stopped ?? 0, color: palette.amber },
          { label: "Envoyés", value: stat?.totalSent ?? 0, color: palette.pink },
        ].map((m) => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div className="nb-display nb-mono" style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "var(--nb-text-3)" }}>{m.label}</div>
          </div>
        ))}
      </div>
      <SegmentBar parts={[{ value: stat?.active ?? 0, color: palette.cyan }, { value: stat?.completed ?? 0, color: palette.violet }, { value: stat?.stopped ?? 0, color: palette.amber }]} />
      {total === 0 && <div style={{ fontSize: 12, color: "var(--nb-text-3)", marginTop: -8 }}>Aucun lead inscrit pour l'instant.</div>}
      {reasons.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {reasons.map(([k, n]) => {
            const r = STOPPED_REASON[k] ?? (k.startsWith("send_failed") ? { label: "Échec d'envoi SMTP", color: palette.red } : { label: k, color: "#94a0bd" });
            return (
              <Tooltip key={k} title={STOPPED_REASON[k] ? undefined : k}>
                <span><Chip size="sm" color={r.color}>{r.label} · {n}</Chip></span>
              </Tooltip>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: "auto" }} onClick={(e) => e.stopPropagation()}>
        <Button icon={<TeamOutlined />} onClick={onLeads} style={{ flex: 1 }}>Inscrire / suivre</Button>
        <Button icon={isPaused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={onTogglePause} type={isPaused ? "primary" : "default"} style={{ flex: 1 }}>
          {isPaused ? "Reprendre" : "Pause"}
        </Button>
      </div>
    </div>
  );
}
