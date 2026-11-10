"use client";

/**
 * Fil d'activité unifié d'un lead : historique CRM, événements email (campagnes / relances)
 * et messages échangés, triés du plus récent au plus ancien, avec des libellés lisibles.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Segmented } from "antd";
import {
  AimOutlined, ApiOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeOutlined, ImportOutlined, MailOutlined,
  MessageOutlined, RetweetOutlined, RobotOutlined, SendOutlined, StopOutlined, SwapOutlined, TagsOutlined, ThunderboltOutlined,
  UndoOutlined, UserOutlined, WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import SafeHtml from "@/components/SafeHtml";
import { palette } from "@/lib/theme";
import { STATUS_LABELS } from "@/lib/leadStatus";

dayjs.extend(relativeTime);
dayjs.locale("fr");

export type HistoryEntry = { id: string; type: string; userId: string | null; payload: unknown; createdAt: string };
export type ThreadMessage = {
  id: string; direction: "inbound" | "outbound"; from: string; to: string; subject: string | null;
  bodyText: string | null; bodyHtml: string | null; isAutoReply: boolean; receivedAt: string;
};
export type EngagementEvent = {
  id: string; type: string; occurredAt: string; url: string | null;
  campaign: { id: string; name: string } | null; sequence: { id: string; name: string } | null;
};

type Item = { id: string; at: string; kind: "crm" | "email" | "message"; icon: ReactNode; color: string; title: ReactNode; detail?: ReactNode; body?: ReactNode };

const statusLabel = (s: unknown) => STATUS_LABELS[String(s) as keyof typeof STATUS_LABELS] ?? String(s ?? "—");

const EVENT: Record<string, { label: string; color: string; icon: ReactNode }> = {
  SENT: { label: "Email envoyé", color: palette.violet, icon: <SendOutlined /> },
  OPEN: { label: "Email ouvert", color: palette.cyan, icon: <EyeOutlined /> },
  CLICK: { label: "Lien cliqué", color: palette.pink, icon: <AimOutlined /> },
  REPLIED: { label: "A répondu", color: palette.green, icon: <MessageOutlined /> },
  BOUNCE: { label: "Email rejeté (bounce)", color: palette.amber, icon: <WarningOutlined /> },
  UNSUBSCRIBE: { label: "Désinscription", color: palette.red, icon: <StopOutlined /> },
};

function describeHistory(h: HistoryEntry, userName: (id: string) => string): Omit<Item, "id" | "at" | "kind"> {
  const p = (h.payload ?? {}) as Record<string, unknown>;
  switch (h.type) {
    case "created":
      return { icon: <UserOutlined />, color: palette.blue, title: "Lead créé", detail: [p.source, p.channel].filter(Boolean).join(" · ") || undefined };
    case "imported":
      return { icon: <ImportOutlined />, color: palette.blue, title: "Importé", detail: p.source ? String(p.source) : undefined };
    case "scraped_imported":
    case "scraped_auto_imported":
      return { icon: <RobotOutlined />, color: palette.cyan, title: "Trouvé par la prospection IA", detail: h.type === "scraped_auto_imported" ? "import automatique" : "validé manuellement" };
    case "status_change":
      return { icon: <SwapOutlined />, color: palette.violet, title: <>Statut : {statusLabel(p.from)} → <b>{statusLabel(p.to)}</b></>, detail: p.reason ? String(p.reason) : undefined };
    case "assigned":
    case "lead_assigned":
      return { icon: <UserOutlined />, color: palette.indigo, title: <>Assigné à <b>{p.to ? userName(String(p.to)) : "—"}</b></> };
    case "unassigned":
      return { icon: <UserOutlined />, color: "#94a0bd", title: "Désassigné" };
    case "tags_set": {
      const to = Array.isArray(p.to) ? (p.to as string[]) : [];
      return { icon: <TagsOutlined />, color: palette.amber, title: "Tags mis à jour", detail: to.length ? to.join(", ") : "aucun tag" };
    }
    case "updated":
      return { icon: <EditOutlined />, color: "#94a0bd", title: "Fiche modifiée", detail: Array.isArray(p.fields) ? (p.fields as string[]).join(", ") : undefined };
    case "soft_deleted":
      return { icon: <DeleteOutlined />, color: palette.red, title: "Archivé" };
    case "restored":
      return { icon: <UndoOutlined />, color: palette.green, title: "Restauré" };
    case "recalc_score":
      return {
        icon: <ThunderboltOutlined />, color: palette.green,
        title: <>Score recalculé{p.score != null ? <> : <b>{String(p.score)}</b></> : null}</>,
        // E-07 — recalcul automatique après un enrichissement (unitaire ou en masse).
        detail: p.trigger === "enrichment" ? `après enrichissement${p.from != null ? ` (avant : ${String(p.from)})` : ""}` : undefined,
      };
    case "enriched":
      return { icon: <ApiOutlined />, color: palette.cyan, title: "Enrichi", detail: Array.isArray(p.providers) ? (p.providers as string[]).join(", ") : undefined };
    case "ai_qualified":
      return { icon: <ThunderboltOutlined />, color: palette.violet, title: "Qualifié par l'IA", detail: p.score != null ? `potentiel ${String(p.score)}` : undefined };
    case "reply_received":
      return { icon: <MessageOutlined />, color: palette.green, title: "Réponse reçue", detail: p.category ? `classée « ${String(p.category)} »` : undefined };
    case "auto_reply_received":
      return { icon: <RobotOutlined />, color: "#94a0bd", title: "Réponse automatique reçue" };
    case "auto_reply_draft":
      return { icon: <RobotOutlined />, color: palette.violet, title: "Brouillon de réponse rédigé par l'IA" };
    case "campaign_email_sent":
      return { icon: <SendOutlined />, color: palette.violet, title: "Email de campagne envoyé" };
    case "email_bounced":
      return {
        icon: <WarningOutlined />, color: p.bounceType === "hard" ? palette.red : palette.amber,
        title: p.bounceType === "hard" ? "Email rejeté définitivement (adresse invalide)" : "Email non remis (échec temporaire)",
        detail: [p.status ? `code ${String(p.status)}` : null, p.blacklisted ? "inscrit en liste noire" : null, Number(p.sequencesStopped) > 0 ? "relances arrêtées" : null].filter(Boolean).join(" · ") || undefined,
      };
    case "sequence_step_sent":
      return { icon: <RetweetOutlined />, color: palette.violet, title: "Relance envoyée", detail: p.step != null ? `étape ${Number(p.step) + 1}` : undefined };
    default:
      return { icon: <CheckCircleOutlined />, color: "#94a0bd", title: h.type.replace(/_/g, " ") };
  }
}

export function LeadActivity({
  history, thread, events, userName,
}: { history: HistoryEntry[]; thread: ThreadMessage[]; events: EngagementEvent[]; userName: (id: string) => string }) {
  const [filter, setFilter] = useState<"all" | "email" | "message" | "crm">("all");

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const h of history) out.push({ id: `h-${h.id}`, at: h.createdAt, kind: "crm", ...describeHistory(h, userName) });
    for (const e of events) {
      const ev = EVENT[e.type] ?? { label: e.type, color: "#94a0bd", icon: <MailOutlined /> };
      const via = e.campaign ? <Link href={`/campaigns/${e.campaign.id}`}>{e.campaign.name}</Link> : e.sequence ? <Link href={`/sequences/${e.sequence.id}`}>{e.sequence.name}</Link> : null;
      out.push({
        id: `e-${e.id}`, at: e.occurredAt, kind: "email", icon: ev.icon, color: ev.color, title: ev.label,
        detail: <>{via}{e.url ? <> · <span style={{ wordBreak: "break-all" }}>{e.url}</span></> : null}</>,
      });
    }
    for (const m of thread) {
      const inbound = m.direction === "inbound";
      out.push({
        id: `m-${m.id}`, at: m.receivedAt, kind: "message",
        icon: inbound ? <MessageOutlined /> : <SendOutlined />, color: inbound ? palette.green : palette.violet,
        title: <>{inbound ? (m.isAutoReply ? "Réponse automatique" : "Message reçu") : "Message envoyé"} — <b>{m.subject ?? "(sans objet)"}</b></>,
        body: m.bodyHtml ? <SafeHtml html={m.bodyHtml} /> : <div style={{ whiteSpace: "pre-wrap" }}>{m.bodyText ?? ""}</div>,
      });
    }
    return out.sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf());
  }, [history, thread, events, userName]);

  const visible = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const count = (k: Item["kind"]) => items.filter((i) => i.kind === k).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
        options={[
          { value: "all", label: `Tout · ${items.length}` },
          { value: "message", label: `Échanges · ${count("message")}` },
          { value: "email", label: `Suivi email · ${count("email")}` },
          { value: "crm", label: `CRM · ${count("crm")}` },
        ]}
      />
      {visible.length === 0 ? (
        <div style={{ color: "var(--nb-text-3)", fontSize: 13, padding: "16px 0" }}>Aucune activité dans cette catégorie.</div>
      ) : (
        <div style={{ position: "relative", display: "grid", gap: 4 }}>
          <span aria-hidden style={{ position: "absolute", left: 15, top: 8, bottom: 8, width: 2, background: "var(--nb-border)", borderRadius: 2 }} />
          {visible.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 14, position: "relative", padding: "8px 0" }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: it.color, background: "var(--nb-surface)", border: `1.5px solid ${it.color}`, zIndex: 1 }}>
                {it.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--nb-text-strong)", fontSize: 13.5 }}>{it.title}</span>
                  <span title={dayjs(it.at).format("DD/MM/YYYY HH:mm")} style={{ fontSize: 11.5, color: "var(--nb-text-3)", whiteSpace: "nowrap" }}>{dayjs(it.at).fromNow()}</span>
                </div>
                {it.detail && <div style={{ fontSize: 12, color: "var(--nb-text-3)", marginTop: 2 }}>{it.detail}</div>}
                {it.body && (
                  <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 12, background: "var(--nb-control)", border: "1px solid var(--nb-border)", fontSize: 13, maxHeight: 240, overflow: "auto", color: "var(--nb-text)" }}>
                    {it.body}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
