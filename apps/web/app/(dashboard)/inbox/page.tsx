"use client";

/**
 * Page /inbox — boîte de réception des réponses prospects (R-01 → R-04).
 * Deux panneaux : liste triée par Claude (catégories) + lecture du fil et réponse.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Drawer, Form, Input, Pagination, Segmented, Select, Skeleton, Switch, Tooltip, message } from "antd";
import {
  CheckOutlined, MailOutlined, ReloadOutlined, SendOutlined, ThunderboltOutlined, UserOutlined, InboxOutlined, ArrowLeftOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette, statusColors } from "@/lib/theme";
import { useIsMobile } from "@/lib/responsive";
import { PageHeader } from "@/components/ui/PageHeader";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, EmptyState } from "@/components/ui/Kit";
import SafeHtml from "@/components/SafeHtml";
import { STATUS_LABELS } from "@/lib/leadStatus";
import type { LeadStatus } from "@crm/db";

type InboxItem = {
  id: string;
  leadId: string | null;
  lead: { id: string; firstName: string | null; lastName: string | null; company: string | null; status: LeadStatus } | null;
  messageId: string;
  inReplyTo: string | null;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string | null;
  preview: string | null;
  category: string | null;
  isAutoReply: boolean;
  isRead: boolean;
  receivedAt: string;
};

type ThreadItem = InboxItem & { bodyText: string | null; bodyHtml: string | null };
type SmtpOption = { id: string; label: string; fromEmail: string | null };
type View = "replies" | "unmatched" | "auto" | "all";

/** Catégories posées par le skill Claude crm-reply-categorize (ou l'heuristique de repli). */
const CATEGORIES: Record<string, { label: string; color: string; action: string }> = {
  interesse: { label: "Intéressé", color: palette.green, action: "Proposez un créneau de rendez-vous rapidement." },
  rappel: { label: "Rappel demandé", color: palette.amber, action: "Planifiez une relance à la date indiquée." },
  pas_interesse: { label: "Pas intéressé", color: palette.red, action: "Clôturez poliment et passez le lead en Perdu." },
  hors_sujet: { label: "Hors sujet", color: palette.blue, action: "Vérifiez l'interlocuteur ou rattachez le message." },
  auto_reply: { label: "Réponse auto", color: "#94a0bd", action: "Aucune action : message automatique." },
};

function leadName(it: InboxItem): string {
  if (!it.lead) return it.from.replace(/<.*>/, "").trim() || it.from;
  return [it.lead.firstName, it.lead.lastName].filter(Boolean).join(" ") || it.lead.company || "(sans nom)";
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function initials(s: string): string {
  return s.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 2) || "?";
}

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

/** Liens profonds : `?leadId=` (fil d'un lead, ouvert automatiquement) et `?category=` (filtre initial). */
function Inbox() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const urlParams = useSearchParams();
  const leadFilter = urlParams.get("leadId");
  const autoOpened = useRef<string | null>(null);
  const [data, setData] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, setView] = useState<View>("replies");
  const [category, setCategory] = useState<string>(urlParams.get("category") ?? "all");
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<ThreadItem | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [smtpOpts, setSmtpOpts] = useState<SmtpOption[]>([]);
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (unreadOnly) params.set("unreadOnly", "true");
      params.set("view", view);
      if (leadFilter) params.set("leadId", leadFilter);
      const r = await api.get<{ data: InboxItem[]; total: number }>(`/inbox?${params.toString()}`);
      setData(r.data.data);
      setTotal(r.data.total);
    } catch {
      message.error("Impossible de charger la boîte de réception.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, unreadOnly, view, leadFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<{ data: SmtpOption[] }>("/smtp-configs?active=true").then((r) => setSmtpOpts(r.data.data)).catch(() => {});
  }, []);

  // Arrivée depuis une fiche lead : on ouvre directement le message le plus récent de ce lead.
  useEffect(() => {
    if (!leadFilter || loading || autoOpened.current === leadFilter || data.length === 0) return;
    autoOpened.current = leadFilter;
    void openItem(data[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ouverture unique par lead
  }, [leadFilter, loading, data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of data) if (it.category) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [data]);
  const visible = category === "all" ? data : data.filter((it) => it.category === category);
  const unread = data.filter((it) => !it.isRead).length;

  async function openItem(item: InboxItem) {
    setThreadLoading(true);
    try {
      const r = await api.get<{ data: ThreadItem }>(`/inbox/${item.id}`);
      setOpened(r.data.data);
      if (!item.isRead) {
        await api.patch(`/inbox/${item.id}`, { isRead: true });
        setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, isRead: true } : x)));
      }
      if (item.leadId) {
        const t = await api.get<{ data: ThreadItem[] }>(`/leads/${item.leadId}/thread`);
        setThread(t.data.data);
      } else {
        setThread([r.data.data]);
      }
      form.resetFields();
      const replySubj = item.subject ? (item.subject.startsWith("Re:") ? item.subject : `Re: ${item.subject}`) : "";
      form.setFieldsValue({ subject: replySubj, smtpConfigId: smtpOpts[0]?.id });
    } catch {
      message.error("Impossible d'ouvrir le message.");
    } finally {
      setThreadLoading(false);
    }
  }

  async function toggleRead(item: InboxItem) {
    try {
      await api.patch(`/inbox/${item.id}`, { isRead: !item.isRead });
      setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, isRead: !x.isRead } : x)));
    } catch {
      message.error("Échec de la mise à jour.");
    }
  }

  async function recategorize(item: InboxItem) {
    try {
      const { data: res } = await api.post<{ data: { id: string; category: string; source: string } }>(`/inbox/${item.id}/categorize`);
      setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, category: res.data.category } : x)));
      setOpened((o) => (o && o.id === item.id ? { ...o, category: res.data.category } : o));
      message.success(`Classé « ${CATEGORIES[res.data.category]?.label ?? res.data.category} » (${res.data.source === "ai" ? "IA" : "heuristique"})`);
    } catch {
      message.error("Échec de la catégorisation.");
    }
  }

  async function submitReply() {
    if (!opened) return;
    try {
      const values = await form.validateFields();
      setSending(true);
      await api.post(`/inbox/${opened.id}/reply`, values);
      message.success("Réponse envoyée");
      form.setFieldsValue({ bodyHtml: "" });
      if (opened.leadId) {
        const t = await api.get<{ data: ThreadItem[] }>(`/leads/${opened.leadId}/thread`);
        setThread(t.data.data);
      }
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setSending(false);
    }
  }

  const list = (
    <div className="nb-glass" style={{ borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", height: isMobile ? "auto" : "calc(100vh - 300px)", minHeight: 480 }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--nb-border)", display: "flex", gap: 8, alignItems: "center" }}>
        <Input.Search
          placeholder="Sujet, contenu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={() => { setPage(1); void load(); }}
          allowClear
        />
        <Tooltip title="Non lus uniquement">
          <Switch size="small" checked={unreadOnly} onChange={(v) => { setUnreadOnly(v); setPage(1); }} />
        </Tooltip>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 16 }}><Skeleton active avatar paragraph={{ rows: 2 }} /><Skeleton active avatar paragraph={{ rows: 2 }} /></div>
        ) : visible.length === 0 ? (
          <EmptyState title="Aucun message" description="Les réponses de vos prospects apparaîtront ici, triées par l'IA." />
        ) : (
          visible.map((it, i) => {
            const cat = it.category ? CATEGORIES[it.category] : undefined;
            const c = cat?.color ?? palette.violet;
            const active = opened?.id === it.id;
            const name = leadName(it);
            return (
              <div
                key={it.id}
                onClick={() => void openItem(it)}
                style={{
                  display: "flex", gap: 12, padding: "14px 16px", cursor: "pointer", position: "relative",
                  borderBottom: "1px solid var(--nb-border)",
                  background: active ? `linear-gradient(90deg, ${c}26, transparent)` : it.isRead ? "transparent" : "rgba(139,92,246,0.06)",
                  boxShadow: active ? `inset 3px 0 0 ${c}` : undefined,
                  animation: `nb-slide-in 0.4s var(--nb-ease) ${Math.min(i, 12) * 0.03}s both`,
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${c}, ${palette.violet})`,
                  }}
                >
                  {initials(name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: it.isRead ? 500 : 700, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "var(--nb-text-3)", flexShrink: 0 }}>{timeAgo(it.receivedAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: it.isRead ? "var(--nb-text-2)" : "var(--nb-text)", fontWeight: it.isRead ? 400 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                    {it.subject ?? "(sans sujet)"}
                  </div>
                  {it.preview && (
                    <div style={{ fontSize: 12, color: "var(--nb-text-3)", marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {it.preview}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {cat && <Chip size="sm" color={c}>{cat.label}</Chip>}
                    {it.lead && <Chip size="sm" color={statusColors[it.lead.status] ?? palette.violet}>{STATUS_LABELS[it.lead.status]}</Chip>}
                    {!it.lead && <Chip size="sm" color="#94a0bd">Non rattaché</Chip>}
                  </div>
                </div>
                {!it.isRead && <span className="nb-pulse-dot" style={{ position: "absolute", right: 14, bottom: 16, color: palette.cyan, width: 8, height: 8 }} />}
              </div>
            );
          })
        )}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid var(--nb-border)", display: "flex", justifyContent: "center" }}>
        <Pagination size="small" current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={(p, ps) => { setPage(p); setPageSize(ps); }} />
      </div>
    </div>
  );

  const reader = !opened ? (
    <div className="nb-glass" style={{ borderRadius: 20, height: "100%", minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <EmptyState title="Sélectionnez un message" description="Le fil complet de la conversation s'affiche ici, avec l'analyse de l'IA et la réponse rapide." />
    </div>
  ) : (
    <ReadingPane
      opened={opened}
      thread={thread}
      loading={threadLoading}
      smtpOpts={smtpOpts}
      form={form}
      sending={sending}
      onReply={() => void submitReply()}
      onRecategorize={() => void recategorize(opened)}
      onToggleRead={() => void toggleRead(opened)}
      onBack={isMobile ? () => setOpened(null) : undefined}
    />
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageHeader
        icon={<MailOutlined />}
        title="Boîte de"
        highlight="réception"
        subtitle="Réponses relevées par IMAP, rattachées aux leads et triées automatiquement par l'IA."
        badges={<AIBadge>Tri par l'IA</AIBadge>}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void load()}>Rafraîchir</Button>}
      />

      {leadFilter && (
        <div className="nb-glass" style={{ borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <UserOutlined style={{ color: palette.cyan }} />
          <span style={{ fontSize: 13, color: "var(--nb-text-2)" }}>
            Conversation de <b style={{ color: "var(--nb-text-strong)" }}>{data[0] ? leadName(data[0]) : "ce lead"}</b> · {total} message(s)
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Link href={`/leads/${leadFilter}`}><Button size="small">Fiche lead</Button></Link>
            <Button size="small" onClick={() => router.replace("/inbox")}>Voir toute la boîte</Button>
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented<View>
          value={view}
          onChange={(v) => { setView(v); setPage(1); }}
          options={[
            { value: "replies", label: "Réponses" },
            { value: "unmatched", label: "Non rattachés" },
            { value: "auto", label: "Auto-replies" },
            { value: "all", label: "Tous" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--nb-text-3)" }}>
          <InboxOutlined /> {total} message(s) · {unread} non lu(s) sur cette page
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <CategoryButton active={category === "all"} color={palette.violet} label="Toutes" count={data.length} onClick={() => setCategory("all")} />
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <CategoryButton key={key} active={category === key} color={cat.color} label={cat.label} count={counts[key] ?? 0} onClick={() => setCategory(key)} />
        ))}
      </div>
      </div>

      {isMobile ? (
        <>
          {list}
          <Drawer open={!!opened} onClose={() => setOpened(null)} width="100%" title={null} closeIcon={null} styles={{ body: { padding: 12 } }}>
            {reader}
          </Drawer>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) minmax(0, 1fr)", gap: 16, alignItems: "stretch" }}>
          {list}
          <div style={{ height: "calc(100vh - 300px)", minHeight: 480 }}>{reader}</div>
        </div>
      )}
    </div>
  );
}

function CategoryButton({ active, color, label, count, onClick }: { active: boolean; color: string; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
        fontSize: 12.5, fontWeight: 600, border: `1px solid ${active ? color : "var(--nb-border)"}`,
        background: active ? `${color}22` : "var(--nb-control)", color: active ? color : "var(--nb-text-2)",
        boxShadow: active ? `0 0 18px -6px ${color}` : "none", transition: "all 0.2s",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
      <span className="nb-mono" style={{ fontSize: 11, opacity: 0.8 }}>{count}</span>
    </button>
  );
}

function ReadingPane({
  opened,
  thread,
  loading,
  smtpOpts,
  form,
  sending,
  onReply,
  onRecategorize,
  onToggleRead,
  onBack,
}: {
  opened: ThreadItem;
  thread: ThreadItem[];
  loading: boolean;
  smtpOpts: SmtpOption[];
  form: ReturnType<typeof Form.useForm>[0];
  sending: boolean;
  onReply: () => void;
  onRecategorize: () => void;
  onToggleRead: () => void;
  onBack?: () => void;
}) {
  const cat = opened.category ? CATEGORIES[opened.category] : undefined;
  const name = leadName(opened);

  return (
    <div className="nb-glass nb-fade-up" key={opened.id} style={{ borderRadius: 20, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* En-tête */}
      <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--nb-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {onBack && <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginBottom: 6, paddingLeft: 0 }}>Retour</Button>}
            <div className="nb-display" style={{ fontSize: 20, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.25 }}>{opened.subject ?? "(sans sujet)"}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 13, color: "var(--nb-text-2)" }}>
              <UserOutlined /> {opened.from}
              {opened.lead && (
                <Link href={`/leads/${opened.lead.id}`}>
                  <Chip size="sm" color={statusColors[opened.lead.status] ?? palette.violet}>{name} · {STATUS_LABELS[opened.lead.status]}</Chip>
                </Link>
              )}
              <span style={{ color: "var(--nb-text-3)" }}>· {new Date(opened.receivedAt).toLocaleString("fr-FR")}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {opened.direction === "inbound" && (
              <Tooltip title="Faire re-classer ce message par l'IA">
                <Button icon={<ThunderboltOutlined />} onClick={onRecategorize}>Reclasser</Button>
              </Tooltip>
            )}
            <Tooltip title={opened.isRead ? "Marquer non lu" : "Marquer lu"}>
              <Button icon={<CheckOutlined />} onClick={onToggleRead} />
            </Tooltip>
          </div>
        </div>

        {cat && (
          <div
            style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 14, display: "flex", gap: 12, alignItems: "center",
              background: `linear-gradient(90deg, ${cat.color}22, transparent)`, border: `1px solid ${cat.color}44`,
            }}
          >
            <span style={{ fontSize: 18, color: cat.color }}>✦</span>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--nb-text-2)" }}>L'IA a classé ce message </span>
              <b style={{ color: cat.color }}>{cat.label}</b>
              <span style={{ color: "var(--nb-text-2)" }}> — {cat.action}</span>
            </div>
          </div>
        )}
      </div>

      {/* Fil */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "grid", gap: 14, alignContent: "start" }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          thread.map((m) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "82%", borderRadius: 18, padding: "12px 16px",
                    borderTopRightRadius: out ? 6 : 18, borderTopLeftRadius: out ? 18 : 6,
                    background: out ? "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(99,102,241,0.14))" : "var(--nb-control)",
                    border: `1px solid ${out ? "rgba(139,92,246,0.4)" : "var(--nb-border)"}`,
                    boxShadow: m.id === opened.id ? `0 0 0 2px ${palette.cyan}66` : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 11, color: "var(--nb-text-3)", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: out ? palette.violet : palette.cyan }}>{out ? "Vous" : name}</span>
                    <span>{new Date(m.receivedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {m.subject && <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nb-text-strong)", marginBottom: 6 }}>{m.subject}</div>}
                  {m.bodyHtml ? (
                    <SafeHtml html={m.bodyHtml} style={{ maxHeight: 320, overflow: "auto", fontSize: 13.5 }} />
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--nb-text)" }}>{m.bodyText ?? "(corps vide)"}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Réponse */}
      <div style={{ padding: "14px 22px 18px", borderTop: "1px solid var(--nb-border)", background: "var(--nb-control)" }}>
        <Form layout="vertical" form={form} disabled={opened.direction === "outbound"} requiredMark={false}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 10 }}>
            <Form.Item name="smtpConfigId" rules={[{ required: true, message: "Compte SMTP requis" }]} style={{ marginBottom: 10 }}>
              <Select placeholder="Compte d'envoi" options={smtpOpts.map((o) => ({ value: o.id, label: `${o.label}${o.fromEmail ? ` <${o.fromEmail}>` : ""}` }))} />
            </Form.Item>
            <Form.Item name="subject" rules={[{ required: true, message: "Sujet requis" }]} style={{ marginBottom: 10 }}>
              <Input placeholder="Sujet" />
            </Form.Item>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <Form.Item name="bodyHtml" rules={[{ required: true, message: "Message requis" }]} style={{ marginBottom: 0, flex: 1 }}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={`Répondre à ${name}…`} />
            </Form.Item>
            <Button type="primary" size="large" icon={<SendOutlined />} loading={sending} onClick={onReply}>Envoyer</Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
