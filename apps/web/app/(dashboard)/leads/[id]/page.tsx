"use client";

/** Fiche lead « 360° » : identité, étape commerciale, analyse IA, activité unifiée et contexte. */
import { use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Col, Dropdown, Modal, Row, Select, Skeleton, Tooltip, message } from "antd";
import {
  ArrowLeftOutlined, BankOutlined, CopyOutlined, DeleteOutlined, EllipsisOutlined, EnvironmentOutlined, GlobalOutlined, HistoryOutlined,
  ImportOutlined, InboxOutlined, MailOutlined, PhoneOutlined, ReloadOutlined, RetweetOutlined, TagsOutlined, ThunderboltOutlined, UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { LeadStatus } from "@crm/db";
import { api } from "@/lib/client";
import { palette, statusColors } from "@/lib/theme";
import { STATUS_LABELS, allowedTransitions } from "@/lib/leadStatus";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, EmptyState, Panel, ScoreRing } from "@/components/ui/Kit";
import { LeadEnrichmentCard } from "@/components/leads/LeadEnrichmentCard";
import { LeadActivity, type EngagementEvent, type HistoryEntry, type ThreadMessage } from "@/components/leads/LeadActivity";
import { SEQ_LEAD_STATUS, STOP_REASON } from "@/components/sequences/types";

interface LeadDTO {
  id: string; email: string | null; phone: string | null;
  firstName: string | null; lastName: string | null; company: string | null; website: string | null;
  sector: string | null; city: string | null; country: string | null; source: string | null;
  status: LeadStatus; emailStatus: string; score: number; tags: string[]; notes: string | null;
  assignedToId: string | null; lastActionAt: string | null; lastReplyAt: string | null;
  enrichment: unknown; deletedAt: string | null;
  contacts: { phones: { number: string; display: string; kind: string }[]; decisionMaker?: { email?: string | null; phone?: string | null } | null; linkedinProfiles?: string[] } | null;
  createdAt: string; updatedAt: string;
}
interface UserLite { id: string; name: string; email: string; role: string }
interface TagRef { id: string; name: string; color: string | null }
type Engagement = {
  events: EngagementEvent[];
  sequences: { id: string; status: string; currentStep: number; sentCount: number; stoppedReason: string | null; nextSendAt: string | null; sequence: { id: string; name: string; stepCount: number } }[];
};
type SiteAnalysis = { summary?: string; activity?: string | null; services?: string[]; signals?: string[]; fitScore?: number; fitReason?: string | null; decisionMaker?: { name: string; role: string | null } | null };
type SiteContacts = {
  legal?: { siren?: string; siret?: string; legal_form?: string; capital?: string } | null;
  socials?: Partial<Record<string, string>>;
  contactUrl?: string | null;
};
const SOCIAL_LABEL: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube", tiktok: "TikTok" };
const PHONE_KIND: Record<string, string> = { fixe: "Standard", mobile: "Mobile", special: "Numéro spécial" };
type AiBrief = { summary: string; angle: string; score: number; source: "ai" | "fallback" };

const FLOW: LeadStatus[] = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI"];
const EMAIL_STATUS: Record<string, { label: string; color: string }> = {
  VALID: { label: "Email valide", color: palette.green },
  UNKNOWN: { label: "Email non vérifié", color: "#94a0bd" },
  SOFT_BOUNCE: { label: "Rebond temporaire", color: palette.amber },
  HARD_BOUNCE: { label: "Email invalide", color: palette.red },
  UNSUBSCRIBED: { label: "Désinscrit", color: palette.red },
};

function fullName(l: LeadDTO) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead sans nom";
}

function ContactRow({ icon, label, value, href, copy }: { icon: ReactNode; label: string; value: string | null; href?: string; copy?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--nb-border)" }}>
      <span style={{ color: "var(--nb-text-3)", width: 18, textAlign: "center" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--nb-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ fontSize: 13.5, color: value ? "var(--nb-text-strong)" : "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {value ? (href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{value}</a> : value) : "—"}
        </div>
      </div>
      {copy && value && (
        <Tooltip title="Copier">
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void navigator.clipboard.writeText(value).then(() => message.success("Copié"))} />
        </Tooltip>
      )}
    </div>
  );
}

function StatusFlow({ status, onChange }: { status: LeadStatus; onChange: (s: LeadStatus) => void }) {
  const allowed = new Set(allowedTransitions(status));
  const idx = FLOW.indexOf(status);
  const lost = status === "PERDU";
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {FLOW.map((s, i) => {
        const current = s === status;
        const passed = !lost && idx >= 0 && i < idx;
        const can = allowed.has(s);
        const color = statusColors[s] ?? palette.violet;
        return (
          <Tooltip key={s} title={current ? "Étape actuelle" : can ? `Passer en « ${STATUS_LABELS[s]} »` : "Transition non autorisée depuis l'étape actuelle"}>
            <button
              type="button"
              disabled={!can}
              onClick={() => onChange(s)}
              style={{
                flex: "1 1 110px", padding: "9px 12px", borderRadius: 12, fontSize: 12.5, fontWeight: 650, transition: "all .2s var(--nb-ease)",
                cursor: can ? "pointer" : current ? "default" : "not-allowed",
                border: `1.5px solid ${current ? color : can ? `${color}66` : "var(--nb-border)"}`,
                background: current ? `${color}26` : passed ? `${color}12` : "var(--nb-control)",
                color: current || passed ? color : can ? "var(--nb-text-2)" : "var(--nb-text-3)",
                boxShadow: current ? `0 0 18px -6px ${color}` : "none",
              }}
            >
              {passed ? "✓ " : ""}{STATUS_LABELS[s]}
            </button>
          </Tooltip>
        );
      })}
      <Tooltip title={lost ? "Étape actuelle" : allowed.has("PERDU") ? "Marquer comme perdu" : undefined}>
        <button
          type="button"
          disabled={!allowed.has("PERDU") && !lost}
          onClick={() => !lost && onChange("PERDU")}
          style={{
            padding: "9px 14px", borderRadius: 12, fontSize: 12.5, fontWeight: 650, cursor: allowed.has("PERDU") ? "pointer" : "default",
            border: `1.5px solid ${lost ? palette.red : `${palette.red}55`}`, background: lost ? `${palette.red}22` : "transparent", color: palette.red,
          }}
        >
          Perdu
        </button>
      </Tooltip>
    </div>
  );
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [modal, modalHolder] = Modal.useModal();
  const [lead, setLead] = useState<LeadDTO | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [engagement, setEngagement] = useState<Engagement>({ events: [], sequences: [] });
  const [users, setUsers] = useState<UserLite[]>([]);
  const [tagsRef, setTagsRef] = useState<TagRef[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: l }, { data: h }, t, e] = await Promise.all([
        api.get<LeadDTO>(`/leads/${id}`),
        api.get<{ data: HistoryEntry[] }>(`/leads/${id}/history`),
        api.get<{ data: ThreadMessage[] }>(`/leads/${id}/thread`).catch(() => ({ data: { data: [] as ThreadMessage[] } })),
        api.get<{ data: Engagement }>(`/leads/${id}/engagement`).catch(() => ({ data: { data: { events: [], sequences: [] } as Engagement } })),
      ]);
      setLead(l);
      setHistory(h.data);
      setThread(t.data.data);
      setEngagement(e.data.data);
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) setNotFound(true);
      else message.error("Impossible de charger le lead.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<{ data: UserLite[] }>("/users").then((r) => setUsers(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { api.get<{ data: TagRef[] }>("/tags").then((r) => setTagsRef(r.data.data ?? [])).catch(() => {}); }, []);

  const userName = useCallback((uid: string) => users.find((u) => u.id === uid)?.name ?? "un commercial", [users]);

  const changeStatus = async (to: LeadStatus) => {
    try {
      await api.post(`/leads/${id}/status`, { status: to });
      message.success(`Étape : ${STATUS_LABELS[to]}`);
      void load();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Changement impossible.");
    }
  };
  const assign = async (userId: string | null) => {
    try {
      await api.post(`/leads/${id}/assign`, { assignedToId: userId });
      message.success(userId ? `Assigné à ${userName(userId)}` : "Lead désassigné");
      void load();
    } catch { message.error("Échec de l'assignation."); }
  };
  const saveTags = async (tags: string[]) => {
    setLead((l) => (l ? { ...l, tags } : l));
    try {
      await api.put(`/leads/${id}/tags`, { tags });
      void load();
    } catch { message.error("Échec de l'enregistrement des tags."); }
  };
  const recalc = async () => {
    try {
      const { data } = await api.post<{ score: number }>(`/leads/${id}/recalculate-score`);
      setLead((l) => (l ? { ...l, score: data.score } : l));
      message.success(`Score recalculé : ${data.score}`);
    } catch { message.error("Échec du recalcul."); }
  };
  const archive = () => {
    void modal.confirm({
      title: "Archiver ce lead ?",
      content: "Il disparaît des listes et des envois ; il reste restaurable.",
      okText: "Archiver",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => { await api.delete(`/leads/${id}`); message.success("Lead archivé"); void load(); },
    });
  };
  const restore = async () => {
    try { await api.post(`/leads/${id}/restore`); message.success("Lead restauré"); void load(); }
    catch { message.error("Restauration impossible."); }
  };

  const ai = useMemo(() => {
    const e = (lead?.enrichment ?? {}) as { siteAnalysis?: SiteAnalysis; aiBrief?: AiBrief };
    return { site: e.siteAnalysis ?? null, brief: e.aiBrief ?? null };
  }, [lead]);

  if (notFound) return <Panel><EmptyState title="Lead introuvable" action={<Link href="/leads"><Button>Retour à la liste</Button></Link>} /></Panel>;
  if (!lead) return <Panel><Skeleton active avatar paragraph={{ rows: 10 }} /></Panel>;

  const name = fullName(lead);
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const emailSt = EMAIL_STATUS[lead.emailStatus] ?? { label: lead.emailStatus, color: "#94a0bd" };
  const opens = engagement.events.filter((e) => e.type === "OPEN").length;
  const clicks = engagement.events.filter((e) => e.type === "CLICK").length;
  const sent = engagement.events.filter((e) => e.type === "SENT").length;

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}

      <div className="nb-glass" style={{ borderRadius: 22, padding: 22, position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", top: -120, right: -80, width: 320, height: 320, borderRadius: "50%", background: `radial-gradient(circle, ${statusColors[lead.status] ?? palette.violet}26, transparent 70%)` }} />
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
          <Link href="/leads"><Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour aux leads" /></Link>
          <span style={{ width: 64, height: 64, borderRadius: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", background: palette.gradient, boxShadow: `0 12px 30px -12px ${palette.violet}` }}>{initials}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <Chip color={statusColors[lead.status] ?? palette.violet} dot>{STATUS_LABELS[lead.status]}</Chip>
              <Chip size="sm" color={emailSt.color}>{emailSt.label}</Chip>
              {lead.deletedAt && <Chip size="sm" color={palette.red}>Archivé</Chip>}
            </div>
            <div className="nb-display" style={{ fontSize: 26, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontSize: 13, color: "var(--nb-text-2)", marginTop: 2 }}>
              {[lead.company !== name ? lead.company : null, lead.sector, [lead.city, lead.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Tooltip title="Score de potentiel (0-100) — engagement email, statut, enrichissement">
              <div style={{ textAlign: "center" }}>
                <ScoreRing score={lead.score} size={62} />
                <div style={{ fontSize: 11, color: "var(--nb-text-3)", marginTop: 4 }}>score</div>
              </div>
            </Tooltip>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {lead.email && <a href={`mailto:${lead.email}`}><Button type="primary" icon={<MailOutlined />}>Écrire</Button></a>}
              <Link href={`/inbox?leadId=${lead.id}`}><Button icon={<InboxOutlined />}>Conversation</Button></Link>
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "score", icon: <ReloadOutlined />, label: "Recalculer le score", onClick: () => void recalc() },
                    { type: "divider" },
                    lead.deletedAt
                      ? { key: "restore", icon: <ReloadOutlined />, label: "Restaurer", onClick: () => void restore() }
                      : { key: "archive", icon: <DeleteOutlined />, label: "Archiver", danger: true, onClick: archive },
                  ],
                }}
              >
                <Button icon={<EllipsisOutlined />} aria-label="Plus d'actions" />
              </Dropdown>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, position: "relative" }}>
          <div className="nb-eyebrow" style={{ marginBottom: 8 }}>Étape commerciale</div>
          <StatusFlow status={lead.status} onChange={(s) => void changeStatus(s)} />
        </div>
      </div>

      <Row gutter={[20, 20]} align="top">
        <Col xs={24} xl={16}>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
            {ai.site || ai.brief ? (
              <div className="nb-glass nb-gradient-border" style={{ borderRadius: 20, padding: 22, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <ThunderboltOutlined style={{ color: palette.violet, fontSize: 18 }} />
                    <span className="nb-display" style={{ fontWeight: 650, fontSize: 16, color: "var(--nb-text-strong)" }}>Ce que l'IA a compris</span>
                    <AIBadge>{ai.brief?.source === "fallback" ? "Heuristique" : "IA"}</AIBadge>
                  </div>
                  {ai.site?.fitScore != null && <Chip color={ai.site.fitScore >= 70 ? palette.green : ai.site.fitScore >= 40 ? palette.amber : palette.red}>Adéquation cible {ai.site.fitScore}/100</Chip>}
                </div>
                {(ai.brief?.summary || ai.site?.summary) && <div style={{ fontSize: 14, color: "var(--nb-text)", lineHeight: 1.65 }}>{ai.brief?.summary ?? ai.site?.summary}</div>}
                {ai.brief?.angle && (
                  <div style={{ padding: "12px 14px", borderRadius: 14, background: `${palette.violet}14`, border: `1px solid ${palette.violet}40`, fontSize: 13.5, color: "var(--nb-text)" }}>
                    <b style={{ color: palette.violet }}>Angle d&apos;approche · </b>{ai.brief.angle}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {ai.site?.decisionMaker && (
                    <div><div className="nb-eyebrow">Décideur identifié</div><div style={{ color: "var(--nb-text-strong)", marginTop: 4 }}>{ai.site.decisionMaker.name}{ai.site.decisionMaker.role ? ` — ${ai.site.decisionMaker.role}` : ""}</div></div>
                  )}
                  {ai.site?.activity && <div><div className="nb-eyebrow">Activité</div><div style={{ color: "var(--nb-text-strong)", marginTop: 4 }}>{ai.site.activity}</div></div>}
                </div>
                {!!ai.site?.signals?.length && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className="nb-eyebrow" style={{ marginRight: 4 }}>Signaux</span>
                    {ai.site.signals.map((s) => <Chip key={s} size="sm" color={palette.cyan}>{s}</Chip>)}
                  </div>
                )}
                {ai.site?.fitReason && <div style={{ fontSize: 12.5, color: "var(--nb-text-3)" }}>{ai.site.fitReason}</div>}
              </div>
            ) : (
              <div className="nb-glass" style={{ borderRadius: 20, padding: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <ThunderboltOutlined style={{ color: palette.violet, fontSize: 22 }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>Pas encore d&apos;analyse IA pour ce lead</div>
                  <div style={{ fontSize: 12.5, color: "var(--nb-text-3)" }}>Les leads trouvés par la prospection IA sont analysés automatiquement. Lancez l&apos;enrichissement « Brief IA » (bloc Enrichissement) pour celui-ci.</div>
                </div>
              </div>
            )}

            <Panel icon={<HistoryOutlined />} title="Activité" subtitle={`${sent} email(s) envoyé(s) · ${opens} ouverture(s) · ${clicks} clic(s) · ${thread.length} message(s)`}>
              <LeadActivity history={history} thread={thread} events={engagement.events} userName={userName} />
            </Panel>
          </div>
        </Col>

        <Col xs={24} xl={8}>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
            <Panel icon={<UserOutlined />} title="Coordonnées" accent={palette.cyan}>
              <ContactRow icon={<MailOutlined />} label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} copy />
              <ContactRow icon={<PhoneOutlined />} label="Téléphone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : undefined} copy />
              <ContactRow icon={<BankOutlined />} label="Entreprise" value={lead.company} />
              <ContactRow icon={<GlobalOutlined />} label="Site web" value={lead.website} href={lead.website ?? undefined} />
              <ContactRow icon={<EnvironmentOutlined />} label="Localisation" value={[lead.city, lead.country].filter(Boolean).join(", ") || null} />
              <ContactRow icon={<ImportOutlined />} label="Source" value={lead.source ? `${lead.source} · ${dayjs(lead.createdAt).format("DD/MM/YYYY")}` : null} />
              {(() => {
                const dm = lead.contacts?.decisionMaker;
                const site = ((lead.enrichment ?? {}) as { siteContacts?: SiteContacts }).siteContacts;
                const extraPhones = (lead.contacts?.phones ?? []).filter((p) => p.display.replace(/\D/g, "") !== (lead.phone ?? "").replace(/\D/g, "").replace(/^33/, "0"));
                const socials = Object.entries(site?.socials ?? {}).filter(([, url]) => !!url) as [string, string][];
                const legal = site?.legal;
                if (!dm?.email && !dm?.phone && !extraPhones.length && !socials.length && !site?.contactUrl && !legal) return null;
                return (
                  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                    <div className="nb-eyebrow">Trouvé sur le site</div>
                    {(dm?.email || dm?.phone) && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>Contact direct du décideur</span>
                        {dm.email && <a href={`mailto:${dm.email}`} style={{ fontSize: 13.5 }}><MailOutlined /> {dm.email}</a>}
                        {dm.phone && <a href={`tel:${dm.phone.replace(/\s/g, "")}`} style={{ fontSize: 13.5 }}><PhoneOutlined /> {dm.phone}</a>}
                      </div>
                    )}
                    {extraPhones.length > 0 && (
                      <div style={{ display: "grid", gap: 6 }}>
                        {extraPhones.map((p) => (
                          <div key={p.number} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                            <PhoneOutlined style={{ color: "var(--nb-text-3)" }} />
                            <a href={`tel:${p.number}`}>{p.display}</a>
                            <Chip size="sm" color={p.kind === "mobile" ? palette.violet : "#94a0bd"}>{PHONE_KIND[p.kind] ?? p.kind}</Chip>
                          </div>
                        ))}
                      </div>
                    )}
                    {(socials.length > 0 || site?.contactUrl) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {socials.map(([k, url]) => (
                          <a key={k} href={url} target="_blank" rel="noreferrer"><Chip size="sm" color={palette.violet}>{SOCIAL_LABEL[k] ?? k}</Chip></a>
                        ))}
                        {site?.contactUrl && <a href={site.contactUrl} target="_blank" rel="noreferrer"><Chip size="sm" color="#94a0bd">Page contact</Chip></a>}
                      </div>
                    )}
                    {legal && (legal.siren || legal.legal_form) && (
                      <div style={{ fontSize: 12.5, color: "var(--nb-text-2)" }}>
                        {legal.legal_form ?? ""}{legal.capital ? ` au capital de ${legal.capital}` : ""}
                        {legal.siren && (
                          <> · SIREN{" "}
                            <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${legal.siren}`} target="_blank" rel="noreferrer">{legal.siren.replace(/(\d{3})(?=\d)/g, "$1 ")}</a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {lead.notes && <div style={{ marginTop: 12, fontSize: 13, color: "var(--nb-text-2)", whiteSpace: "pre-wrap" }}>{lead.notes}</div>}
            </Panel>

            <Panel icon={<TagsOutlined />} title="Suivi" accent={palette.amber}>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <span className="nb-eyebrow">Commercial assigné</span>
                  <Select<string>
                    allowClear
                    placeholder="Aucun commercial"
                    value={lead.assignedToId ?? undefined}
                    onChange={(v) => void assign(v ?? null)}
                    options={users.map((u) => ({ value: u.id, label: u.name }))}
                  />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <span className="nb-eyebrow">Tags <span style={{ textTransform: "none", letterSpacing: 0 }}>· enregistrés automatiquement</span></span>
                  <Select<string[]>
                    mode="tags"
                    placeholder="Ajouter un tag…"
                    value={lead.tags}
                    onChange={(v) => void saveTags(v)}
                    tokenSeparators={[","]}
                    options={tagsRef.map((t) => ({ value: t.name, label: t.name }))}
                  />
                </div>
              </div>
            </Panel>

            <Panel icon={<RetweetOutlined />} title="Séquences de relance" accent={palette.violet}>
              {engagement.sequences.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--nb-text-3)" }}>Ce lead n&apos;est inscrit dans aucune séquence. <Link href="/sequences">Voir les relances</Link></div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {engagement.sequences.map((s) => {
                    const st = SEQ_LEAD_STATUS[s.status] ?? { label: s.status, color: "#94a0bd" };
                    return (
                      <Link key={s.id} href={`/sequences/${s.sequence.id}`} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 14, background: "var(--nb-control)", border: "1px solid var(--nb-border)", color: "inherit" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{s.sequence.name}</span>
                          <Chip size="sm" color={st.color} dot>{st.label}</Chip>
                        </div>
                        <div style={{ display: "flex", gap: 3 }}>
                          {Array.from({ length: s.sequence.stepCount }, (_, i) => (
                            <span key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i < s.sentCount ? palette.violet : "var(--nb-border-strong)" }} />
                          ))}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>
                          {s.sentCount}/{s.sequence.stepCount} envoyé(s)
                          {s.status === "active" && s.nextSendAt ? ` · prochain ${dayjs(s.nextSendAt).format("DD/MM HH:mm")}` : ""}
                          {s.stoppedReason ? ` · ${STOP_REASON[s.stoppedReason] ?? s.stoppedReason}` : ""}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Panel>

            <LeadEnrichmentCard leadId={lead.id} enrichment={lead.enrichment} contacts={lead.contacts} onEnriched={() => void load()} />
          </div>
        </Col>
      </Row>
    </div>
  );
}
