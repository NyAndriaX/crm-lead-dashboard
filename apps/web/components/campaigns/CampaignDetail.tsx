"use client";

/** Page d'une campagne : progression, performance, activité, configuration et aperçu du message. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Col, Dropdown, Modal, Row, Skeleton, Tooltip, message } from "antd";
import {
  AimOutlined, ArrowLeftOutlined, CalendarOutlined, CloudServerOutlined, CopyOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, ExperimentOutlined,
  EyeOutlined, FileTextOutlined, FunnelPlotOutlined, HistoryOutlined, MailOutlined, MessageOutlined, PauseCircleOutlined, RocketOutlined,
  SendOutlined, StopOutlined, TeamOutlined, ThunderboltOutlined, WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { StatCard } from "@/components/ui/StatCard";
import { Chip, EmptyState, Funnel, Panel } from "@/components/ui/Kit";
import { CAMPAIGN_STATUS, rate, type CampaignStats } from "./CampaignCard";
import { EmailPreview } from "./EmailPreview";
import { AbComparison, type CampaignAb } from "./AbComparison";
import { useSegmentPreview } from "./AudiencePreview";
import { describeFilters } from "./SegmentFilterBuilder";
import type { CampaignConfig, CampaignRow } from "./types";

dayjs.extend(relativeTime);
dayjs.locale("fr");

type Activity = {
  daily: ({ date: string } & Record<string, number | string>)[];
  recent: { id: string; eventType: string; occurredAt: string; url: string | null; lead: { id: string; firstName: string | null; lastName: string | null; company: string | null } | null }[];
};

const EVENT: Record<string, { label: string; color: string; icon: ReactNode }> = {
  SENT: { label: "Email envoyé", color: palette.violet, icon: <SendOutlined /> },
  OPEN: { label: "Ouverture", color: palette.cyan, icon: <EyeOutlined /> },
  CLICK: { label: "Clic", color: palette.pink, icon: <AimOutlined /> },
  REPLIED: { label: "Réponse", color: palette.green, icon: <MessageOutlined /> },
  BOUNCE: { label: "Bounce", color: palette.amber, icon: <WarningOutlined /> },
  UNSUBSCRIBE: { label: "Désinscription", color: palette.red, icon: <StopOutlined /> },
};

function InfoRow({ icon, label, children, color = palette.violet }: { icon: ReactNode; label: string; children: ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--nb-border)" }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color, background: `${color}1c` }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ color: "var(--nb-text-strong)", fontSize: 13.5, marginTop: 2 }}>{children}</div>
      </div>
    </div>
  );
}

function ActivityChart({ daily }: { daily: Activity["daily"] }) {
  const days = daily.slice(-21);
  const val = (d: Activity["daily"][number], k: string) => Number(d[k] ?? 0);
  const max = Math.max(1, ...days.map((d) => Math.max(val(d, "SENT"), val(d, "OPEN"))));
  const series = [
    { key: "SENT", color: palette.violet, label: "Envoyés" },
    { key: "OPEN", color: palette.cyan, label: "Ouvertures" },
    { key: "REPLIED", color: palette.green, label: "Réponses" },
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 180 }}>
        {days.map((d, i) => (
          <Tooltip key={d.date} title={<div>{dayjs(d.date).format("ddd DD MMM")}{series.map((s) => <div key={s.key}>{s.label} : {val(d, s.key)}</div>)}</div>}>
            <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", gap: 2 }}>
              {series.map((s) => (
                <div
                  key={s.key}
                  style={{
                    flex: 1, height: `${(val(d, s.key) / max) * 100}%`, minHeight: val(d, s.key) ? 3 : 0, borderRadius: "4px 4px 1px 1px", background: s.color,
                    opacity: 0.9, transformOrigin: "bottom", animation: `nb-grow .7s var(--nb-ease) ${i * 0.02}s both`,
                  }}
                />
              ))}
            </div>
          </Tooltip>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--nb-text-3)", marginTop: 6 }}>
        <span>{days[0] ? dayjs(days[0].date).format("DD MMM") : ""}</span>
        <span style={{ display: "flex", gap: 12 }}>
          {series.map((s) => <span key={s.key}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 4 }} />{s.label}</span>)}
        </span>
        <span>aujourd&apos;hui</span>
      </div>
    </div>
  );
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [modal, modalHolder] = Modal.useModal();
  const [campaign, setCampaign] = useState<(CampaignRow & { template: CampaignRow["template"] & { bodyHtml?: string } }) | null>(null);
  const [stats, setStats] = useState<(CampaignStats & { ab?: CampaignAb | null }) | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, s, a] = await Promise.all([
        api.get<{ data: CampaignRow }>(`/campaigns/${campaignId}`),
        api.get<{ data: CampaignStats & { ab?: CampaignAb | null } }>(`/campaigns/${campaignId}/stats`),
        api.get<{ data: Activity }>(`/campaigns/${campaignId}/activity`),
      ]);
      setCampaign(c.data.data as typeof campaign);
      setStats(s.data.data);
      setActivity(a.data.data);
    } catch {
      setMissing(true);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Rafraîchissement pendant l'envoi pour voir la progression bouger.
  useEffect(() => {
    if (campaign?.status !== "SENDING") return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [campaign?.status, load]);

  const { preview } = useSegmentPreview(campaign?.segment ? (campaign.segment.filters ?? {}) : null);

  const act = async (path: string, ok: string) => {
    try {
      await api.post(`/campaigns/${campaignId}/${path}`, {});
      message.success(ok);
      void load();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Action impossible");
    }
  };

  const remove = () => {
    void modal.confirm({
      title: `Supprimer la campagne « ${campaign?.name} » ?`,
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        try {
          await api.delete(`/campaigns/${campaignId}`);
          message.success("Campagne supprimée");
          router.push("/campaigns");
        } catch {
          message.error("Suppression impossible");
        }
      },
    });
  };

  if (missing) {
    return <Panel><EmptyState title="Campagne introuvable" action={<Link href="/campaigns"><Button>Retour aux campagnes</Button></Link>} /></Panel>;
  }
  if (!campaign || !stats || !activity) return <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>;

  const st = CAMPAIGN_STATUS[campaign.status] ?? { label: campaign.status, color: "#94a0bd" };
  const cfg = (campaign.config ?? {}) as CampaignConfig;
  const editable = ["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status);
  const target = Math.max(preview?.reachable ?? 0, stats.sent);
  const progress = target ? Math.min(100, Math.round((stats.sent / target) * 100)) : 0;
  const sending = campaign.status === "SENDING";

  const primary =
    campaign.status === "DRAFT" ? { label: "Lancer la campagne", icon: <RocketOutlined />, run: () => act("schedule", "Campagne lancée") }
    : campaign.status === "PAUSED" ? { label: "Reprendre l'envoi", icon: <RocketOutlined />, run: () => act("resume", "Reprise demandée") }
    : campaign.status === "SENDING" || campaign.status === "SCHEDULED" ? { label: "Mettre en pause", icon: <PauseCircleOutlined />, run: () => act("pause", "Campagne en pause") }
    : null;

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}
      <div className="nb-fade-up" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <Link href="/campaigns"><Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" /></Link>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            <Chip color={st.color} dot pulse={sending}>{st.label}</Chip>
            {cfg.aiPersonalize && <AIBadge>Personnalisée par l'IA</AIBadge>}
            {cfg.ab?.enabled && <Chip size="sm" color={palette.blue}><ExperimentOutlined /> Test A/B</Chip>}
          </div>
          <div className="nb-display" style={{ fontSize: 26, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.2 }}>{campaign.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {editable && <Link href={`/campaigns/${campaignId}/edit`}><Button icon={<EditOutlined />}>Modifier</Button></Link>}
          {!primary && <Button icon={<CopyOutlined />} onClick={() => router.push(`/campaigns/new?from=${campaignId}`)}>Dupliquer</Button>}
          {primary && <Button type={campaign.status === "SENDING" || campaign.status === "SCHEDULED" ? "default" : "primary"} icon={primary.icon} onClick={() => void primary.run()}>{primary.label}</Button>}
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "duplicate", icon: <CopyOutlined />, label: "Dupliquer", onClick: () => router.push(`/campaigns/new?from=${campaignId}`) },
                { type: "divider" },
                { key: "delete", icon: <DeleteOutlined />, label: "Supprimer", danger: true, disabled: !["DRAFT", "CANCELLED"].includes(campaign.status), onClick: remove },
              ],
            }}
          >
            <Button icon={<EllipsisOutlined />} aria-label="Plus d'actions" />
          </Dropdown>
        </div>
      </div>

      <div className="nb-glass" style={{ borderRadius: 20, padding: 22, position: "relative", overflow: "hidden", borderColor: sending ? `${palette.cyan}66` : undefined }}>
        {sending && <div className="nb-scanline" style={{ opacity: 0.4 }} />}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
          <div>
            <div className="nb-eyebrow">Progression de l&apos;envoi</div>
            <div className="nb-display" style={{ fontSize: 32, fontWeight: 800, color: "var(--nb-text-strong)" }}>
              {stats.sent} <span style={{ fontSize: 16, fontWeight: 500, color: "var(--nb-text-3)" }}>/ {target} destinataires</span>
            </div>
          </div>
          <div style={{ color: "var(--nb-text-2)", fontSize: 13 }}>
            {campaign.status === "SCHEDULED" && campaign.scheduledAt ? <>Départ {dayjs(campaign.scheduledAt).fromNow()} · {dayjs(campaign.scheduledAt).format("DD/MM à HH:mm")}</>
              : campaign.status === "DRAFT" ? "Brouillon — rien n'est envoyé tant que la campagne n'est pas lancée"
              : campaign.status === "DONE" ? "Campagne terminée"
              : sending ? `Envoi par lots · ${Math.round((cfg.throttleMinDelayMs ?? 12_000) / 1000)} s entre deux emails`
              : st.label}
          </div>
        </div>
        <div style={{ height: 12, borderRadius: 12, background: "var(--nb-control)", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 12, background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`, boxShadow: `0 0 18px ${palette.cyan}88`, transformOrigin: "left", animation: "nb-grow-x 1.1s var(--nb-ease) both" }} />
        </div>
      </div>

      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={24} sm={12} xl={6}><StatCard label="Envoyés" value={stats.sent} icon={<SendOutlined />} color={palette.violet} hint={`${progress} % de l'audience`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux d'ouverture" value={rate(stats.opens, stats.sent)} decimals={1} suffix="%" icon={<EyeOutlined />} color={palette.cyan} hint={`${stats.opens} contacts`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux de clic" value={rate(stats.clicks, stats.sent)} decimals={1} suffix="%" icon={<AimOutlined />} color={palette.pink} hint={`${stats.clicks} contacts`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux de réponse" value={rate(stats.replies, stats.sent)} decimals={1} suffix="%" icon={<MessageOutlined />} color={palette.green} hint={`${stats.replies} réponses`} /></Col>
      </Row>

      {stats.ab && <AbComparison ab={stats.ab} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Panel icon={<HistoryOutlined />} title="Activité" subtitle="21 derniers jours" style={{ height: "100%" }}>
            <ActivityChart daily={activity.daily} />
          </Panel>
        </Col>
        <Col xs={24} xl={9}>
          <Panel icon={<FunnelPlotOutlined />} title="Entonnoir" subtitle={`${stats.bounces} bounce(s) · ${stats.unsubscribes} désinscription(s)`} accent={palette.cyan} style={{ height: "100%" }}>
            <Funnel
              height={38}
              steps={[
                { label: "Envoyés", value: stats.sent, color: palette.violet },
                { label: "Ouverts", value: stats.opens, color: palette.cyan },
                { label: "Cliqués", value: stats.clicks, color: palette.pink },
                { label: "Réponses", value: stats.replies, color: palette.green },
              ]}
            />
          </Panel>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={8}>
          <Panel icon={<FileTextOutlined />} title="Configuration" accent={palette.pink}>
            <InfoRow icon={<TeamOutlined />} label="Audience" color={palette.cyan}>
              {campaign.segment ? <Link href={`/campaigns/segments/${campaign.segment.id}`}>{campaign.segment.name}</Link> : "—"}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {describeFilters(campaign.segment?.filters).map((c) => <Chip key={c} size="sm" color={palette.violet}>{c}</Chip>)}
              </div>
            </InfoRow>
            <InfoRow icon={<FileTextOutlined />} label="Template">{campaign.template?.name ?? "—"}</InfoRow>
            <InfoRow icon={<MailOutlined />} label="Objet" color={palette.pink}>{campaign.subject ?? "—"}{cfg.ab?.enabled && cfg.ab.subjectB ? <div style={{ color: "var(--nb-text-3)", fontSize: 12.5 }}>B ({cfg.ab.splitPercent ?? 50} %) : {cfg.ab.subjectB}</div> : null}</InfoRow>
            <InfoRow icon={<CloudServerOutlined />} label="Boîte d'envoi" color={palette.pink}>{campaign.smtpConfig ? `${campaign.smtpConfig.label} · ${campaign.smtpConfig.fromEmail ?? ""}` : "—"}</InfoRow>
            <InfoRow icon={<CalendarOutlined />} label="Départ" color={palette.amber}>{campaign.scheduledAt ? dayjs(campaign.scheduledAt).format("dddd DD MMMM YYYY à HH:mm") : "Au lancement"}</InfoRow>
            <InfoRow icon={<ThunderboltOutlined />} label="Rythme" color={palette.green}>
              {campaign.dailyLimit ?? campaign.smtpConfig?.dailyLimit ?? "—"} / jour · {Math.round((cfg.throttleMinDelayMs ?? 12_000) / 1000)} s entre emails
              {cfg.warmup?.enabled ? ` · warm-up ${cfg.warmup.startPerDay} × ${cfg.warmup.growth}` : ""}
            </InfoRow>
          </Panel>
        </Col>
        <Col xs={24} xl={8}>
          <Panel icon={<MailOutlined />} title="Message" subtitle="Aperçu avec un destinataire réel" accent={palette.violet}>
            <EmailPreview
              fromName={campaign.smtpConfig?.fromName ?? campaign.smtpConfig?.label ?? ""}
              fromEmail={campaign.smtpConfig?.fromEmail ?? ""}
              subject={campaign.subject ?? ""}
              html={cfg.bodyHtmlOverride || campaign.template?.bodyHtml || ""}
              leads={preview?.sample ?? []}
              leadId={previewLead}
              onLead={setPreviewLead}
              ai={!!cfg.aiPersonalize}
            />
          </Panel>
        </Col>
        <Col xs={24} xl={8}>
          <Panel icon={<HistoryOutlined />} title="Derniers événements" accent={palette.green}>
            {activity.recent.length === 0 ? (
              <div style={{ color: "var(--nb-text-3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>Aucun événement pour l&apos;instant.</div>
            ) : (
              <div style={{ display: "grid", gap: 4, maxHeight: 560, overflow: "auto" }}>
                {activity.recent.map((e) => {
                  const ev = EVENT[e.eventType] ?? { label: e.eventType, color: "#94a0bd", icon: <MailOutlined /> };
                  const who = e.lead ? [e.lead.firstName, e.lead.lastName].filter(Boolean).join(" ") || e.lead.company || "Lead" : "Lead supprimé";
                  return (
                    <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 6px", borderRadius: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: ev.color, background: `${ev.color}1c` }}>{ev.icon}</span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                        <div style={{ color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {e.lead ? <Link href={`/leads/${e.lead.id}`}>{who}</Link> : who}
                          {e.lead?.company && <span style={{ color: "var(--nb-text-3)" }}> · {e.lead.company}</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: ev.color }}>{ev.label}</div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--nb-text-3)", whiteSpace: "nowrap" }}>{dayjs(e.occurredAt).fromNow()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </Col>
      </Row>
    </div>
  );
}
