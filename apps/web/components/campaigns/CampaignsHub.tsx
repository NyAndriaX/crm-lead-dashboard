"use client";

/**
 * Page Campagnes : KPIs globaux + trois espaces en onglets (URL `?tab=`) —
 * Campagnes (liste filtrable et paginée), Segments (audiences), Performance (entonnoir, classement).
 * Aucun formulaire en modale : création / édition / détail ont leurs propres pages.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Col, Dropdown, Input, Modal, Pagination, Row, Segmented, Select, Skeleton, Tooltip, message } from "antd";
import {
  AimOutlined, AppstoreOutlined, BarsOutlined, CopyOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, EyeOutlined, FunnelPlotOutlined,
  MailOutlined, MessageOutlined, PauseCircleOutlined, PlusOutlined, RocketOutlined, SafetyCertificateOutlined, SearchOutlined,
  SendOutlined, TeamOutlined, TrophyOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, EmptyState, Funnel, Panel } from "@/components/ui/Kit";
import { CAMPAIGN_STATUS, CampaignCard, rate, type CampaignStats } from "./CampaignCard";
import { describeFilters } from "./SegmentFilterBuilder";
import type { CampaignRow, SegmentRow } from "./types";

type Row = CampaignRow & { metrics: CampaignStats };
type Tab = "campaigns" | "segments" | "performance";

const VIEW_KEY = "crm-campaigns-view";
const PAGE_SIZE = 10;
const STATUS_ORDER = ["SENDING", "SCHEDULED", "PAUSED", "DRAFT", "DONE", "CANCELLED"];

function Metric({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 62 }}>
      <div className="nb-mono" style={{ fontWeight: 700, fontSize: 15, color: value > 0 ? color : "var(--nb-text-3)" }}>{value}<span style={{ fontSize: 11 }}>%</span></div>
      <div style={{ fontSize: 10.5, color: "var(--nb-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function CampaignListRow({ row, target, actions }: { row: Row; target: number; actions: ReactNode }) {
  const router = useRouter();
  const st = CAMPAIGN_STATUS[row.status] ?? { label: row.status, color: "#94a0bd" };
  const m = row.metrics;
  const total = Math.max(target, m.sent);
  const progress = total ? Math.min(100, Math.round((m.sent / total) * 100)) : 0;
  const sending = row.status === "SENDING";
  const when = row.status === "SCHEDULED" && row.scheduledAt ? `départ ${dayjs(row.scheduledAt).format("DD/MM HH:mm")}` : `modifiée ${dayjs(row.updatedAt).format("DD/MM")}`;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/campaigns/${row.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/campaigns/${row.id}`); }}
      className="nb-glass nb-lift nb-camp-row"
      style={{
        padding: "14px 18px 14px 22px", borderRadius: 16, cursor: "pointer",
        position: "relative", overflow: "hidden", borderColor: sending ? `${palette.cyan}66` : undefined,
      }}
    >
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: st.color, boxShadow: `0 0 14px ${st.color}` }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span className="nb-display" style={{ fontWeight: 650, fontSize: 15, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
          {(row.config?.aiPersonalize ?? false) && <Tooltip title="Personnalisée par l'IA"><span style={{ color: palette.violet }}>✦</span></Tooltip>}
        </div>
        <div style={{ fontSize: 12, color: "var(--nb-text-3)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <TeamOutlined /> {row.segment?.name ?? "—"} · <MailOutlined /> {row.template?.name ?? "—"} · {when}
        </div>
      </div>
      <div><Chip color={st.color} dot pulse={sending}>{st.label}</Chip></div>
      <div className="nb-camp-progress">
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 5 }}>
          <span className="nb-mono" style={{ color: "var(--nb-text-strong)", fontWeight: 600 }}>{m.sent} / {total}</span>
          <span style={{ color: "var(--nb-text-3)" }}>{progress} %</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: "var(--nb-control)", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`, transformOrigin: "left", animation: "nb-grow-x .9s var(--nb-ease) both" }} />
        </div>
      </div>
      <div className="nb-camp-metrics" style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        <Metric value={rate(m.opens, m.sent)} label="Ouv." color={palette.cyan} />
        <Metric value={rate(m.clicks, m.sent)} label="Clic" color={palette.pink} />
        <Metric value={rate(m.replies, m.sent)} label="Rép." color={palette.green} />
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>{actions}</div>
    </div>
  );
}

export function CampaignsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "campaigns";
  const [modal, modalHolder] = Modal.useModal();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string | undefined>();
  const [sort, setSort] = useState("recent");
  const [view, setView] = useState<"list" | "cards">("list");
  const [page, setPage] = useState(1);
  const [segQuery, setSegQuery] = useState("");

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "cards" || v === "list") setView(v);
    } catch {
      /* préférence non mémorisée */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.get<{ data: Row[] }>("/campaigns"), api.get<{ data: SegmentRow[] }>("/segments?counts=1")]);
      setCampaigns(c.data.data);
      setSegments(s.data.data);
    } catch {
      message.error("Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setPage(1), [status, query, segmentFilter, sort]);

  const setTab = (t: Tab) => router.replace(t === "campaigns" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const changeView = (v: "list" | "cards") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const reachableBySegment = useMemo(() => new Map(segments.map((s) => [s.id, s.reachable ?? 0])), [segments]);

  const totals = useMemo(() => {
    const t = { sent: 0, opens: 0, clicks: 0, replies: 0, bounces: 0, unsubscribes: 0 };
    for (const c of campaigns) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += c.metrics[k];
    return t;
  }, [campaigns]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of campaigns) out[c.status] = (out[c.status] ?? 0) + 1;
    return out;
  }, [campaigns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = campaigns.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!segmentFilter || c.segment?.id === segmentFilter) &&
        (!q || [c.name, c.template?.name, c.segment?.name, c.subject].join(" ").toLowerCase().includes(q)),
    );
    const replyRate = (c: Row) => rate(c.metrics.replies, c.metrics.sent);
    return [...list].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name)
      : sort === "performance" ? replyRate(b) - replyRate(a) || b.metrics.sent - a.metrics.sent
      : sort === "status" ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      : dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf(),
    );
  }, [campaigns, status, segmentFilter, query, sort]);

  const pageSize = view === "cards" ? 9 : PAGE_SIZE;
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);

  const act = async (id: string, path: string, ok: string) => {
    try {
      await api.post(`/campaigns/${id}/${path}`, {});
      message.success(ok);
      void load();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Action impossible");
    }
  };

  const confirmDelete = (row: Row) => {
    void modal.confirm({
      title: `Supprimer la campagne « ${row.name} » ?`,
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        try {
          await api.delete(`/campaigns/${row.id}`);
          message.success("Campagne supprimée");
          void load();
        } catch {
          message.error("Suppression impossible");
        }
      },
    });
  };

  const rowActions = (r: Row) => {
    const editable = ["DRAFT", "SCHEDULED", "PAUSED"].includes(r.status);
    return (
      <>
        {r.status === "DRAFT" && <Tooltip title="Lancer"><Button type="primary" shape="circle" icon={<RocketOutlined />} onClick={() => void act(r.id, "schedule", "Campagne lancée")} /></Tooltip>}
        {r.status === "PAUSED" && <Tooltip title="Reprendre"><Button type="primary" shape="circle" icon={<RocketOutlined />} onClick={() => void act(r.id, "resume", "Reprise demandée")} /></Tooltip>}
        {(r.status === "SENDING" || r.status === "SCHEDULED") && <Tooltip title="Mettre en pause"><Button shape="circle" icon={<PauseCircleOutlined />} onClick={() => void act(r.id, "pause", "Campagne en pause")} /></Tooltip>}
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "open", icon: <EyeOutlined />, label: "Ouvrir", onClick: () => router.push(`/campaigns/${r.id}`) },
              { key: "edit", icon: <EditOutlined />, label: "Modifier", disabled: !editable, onClick: () => router.push(`/campaigns/${r.id}/edit`) },
              { key: "duplicate", icon: <CopyOutlined />, label: "Dupliquer", onClick: () => router.push(`/campaigns/new?from=${r.id}`) },
              { type: "divider" },
              { key: "delete", icon: <DeleteOutlined />, label: "Supprimer", danger: true, disabled: !["DRAFT", "CANCELLED"].includes(r.status), onClick: () => confirmDelete(r) },
            ],
          }}
        >
          <Button shape="circle" type="text" icon={<EllipsisOutlined />} aria-label="Actions" />
        </Dropdown>
      </>
    );
  };

  const filteredSegments = segments.filter((s) => s.name.toLowerCase().includes(segQuery.trim().toLowerCase()));
  const ranking = [...campaigns].filter((c) => c.metrics.sent > 0).sort((a, b) => rate(b.metrics.replies, b.metrics.sent) - rate(a.metrics.replies, a.metrics.sent)).slice(0, 6);

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}
      <PageHeader
        icon={<MailOutlined />}
        title="Campagnes"
        highlight="emailing"
        subtitle="Ciblez un segment, choisissez un message, lancez — l'IA réécrit chaque email pour son destinataire."
        badges={<AIBadge>Personnalisation IA</AIBadge>}
        extra={
          <>
            <Link href="/campaigns/segments/new"><Button icon={<TeamOutlined />}>Nouveau segment</Button></Link>
            <Link href="/campaigns/new"><Button type="primary" icon={<PlusOutlined />}>Nouvelle campagne</Button></Link>
          </>
        }
      />

      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={24} sm={12} xl={6}><StatCard label="Emails envoyés" value={totals.sent} icon={<SendOutlined />} color={palette.violet} hint={`${campaigns.length} campagne(s) · ${counts.SENDING ?? 0} en cours`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux d'ouverture" value={rate(totals.opens, totals.sent)} decimals={1} suffix="%" icon={<EyeOutlined />} color={palette.cyan} hint={`${totals.opens} contacts ont ouvert`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux de clic" value={rate(totals.clicks, totals.sent)} decimals={1} suffix="%" icon={<AimOutlined />} color={palette.pink} hint={`${totals.clicks} contacts ont cliqué`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Taux de réponse" value={rate(totals.replies, totals.sent)} decimals={1} suffix="%" icon={<MessageOutlined />} color={palette.green} hint={`${totals.replies} réponses`} /></Col>
      </Row>

      {/* Onglets : les segments ont leur propre espace, ils ne sont jamais repoussés sous la liste. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--nb-border)" }}>
        {([
          { key: "campaigns", label: "Campagnes", icon: <MailOutlined />, count: campaigns.length },
          { key: "segments", label: "Segments", icon: <TeamOutlined />, count: segments.length },
          { key: "performance", label: "Performance", icon: <TrophyOutlined /> },
        ] as { key: Tab; label: string; icon: ReactNode; count?: number }[]).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", marginBottom: -1, border: "none", cursor: "pointer",
                background: "transparent", fontSize: 14, fontWeight: 600, color: active ? "var(--nb-text-strong)" : "var(--nb-text-3)",
                borderBottom: `2px solid ${active ? palette.violet : "transparent"}`, transition: "all .2s",
              }}
            >
              <span style={{ color: active ? palette.violet : undefined }}>{t.icon}</span>
              {t.label}
              {t.count !== undefined && (
                <span className="nb-mono" style={{ fontSize: 11.5, padding: "1px 8px", borderRadius: 999, background: active ? `${palette.violet}24` : "var(--nb-control)", color: active ? palette.violet : "var(--nb-text-3)" }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "campaigns" && (
        <div key="campaigns" className="nb-fade-up" style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Segmented
              value={status}
              onChange={(v) => setStatus(String(v))}
              options={[
                { value: "all", label: `Toutes · ${campaigns.length}` },
                ...STATUS_ORDER.filter((s) => counts[s]).map((s) => ({ value: s, label: `${CAMPAIGN_STATUS[s]?.label ?? s} · ${counts[s]}` })),
              ]}
            />
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
              <Input prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />} placeholder="Rechercher" allowClear value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }} />
              <Select
                allowClear
                placeholder="Tous les segments"
                value={segmentFilter}
                onChange={setSegmentFilter}
                options={segments.map((s) => ({ value: s.id, label: s.name }))}
                showSearch
                optionFilterProp="label"
                style={{ width: 190 }}
              />
              <Select
                value={sort}
                onChange={setSort}
                style={{ width: 170 }}
                options={[
                  { value: "recent", label: "Plus récentes" },
                  { value: "status", label: "Par statut" },
                  { value: "performance", label: "Meilleur taux de réponse" },
                  { value: "name", label: "Nom (A → Z)" },
                ]}
              />
              <Segmented
                value={view}
                onChange={(v) => changeView(v as "list" | "cards")}
                options={[{ value: "list", icon: <BarsOutlined />, title: "Liste" }, { value: "cards", icon: <AppstoreOutlined />, title: "Cartes" }]}
              />
            </div>
          </div>

          {loading ? (
            <Panel><Skeleton active paragraph={{ rows: 6 }} /></Panel>
          ) : visible.length === 0 ? (
            <Panel>
              <EmptyState
                title={campaigns.length ? "Aucune campagne ne correspond" : "Aucune campagne"}
                description={campaigns.length ? "Modifiez les filtres ou la recherche." : "Choisissez un segment, un message, et l'IA personnalise chaque email."}
                action={<Link href="/campaigns/new"><Button type="primary" icon={<PlusOutlined />}>Nouvelle campagne</Button></Link>}
              />
            </Panel>
          ) : view === "list" ? (
            <div style={{ display: "grid", gap: 10 }} className="nb-stagger">
              {paged.map((r) => <CampaignListRow key={r.id} row={r} target={reachableBySegment.get(r.segment?.id ?? "") ?? 0} actions={rowActions(r)} />)}
            </div>
          ) : (
            <Row gutter={[16, 16]} className="nb-stagger">
              {paged.map((r) => (
                <Col key={r.id} xs={24} md={12} xl={8}>
                  <CampaignCard
                    name={r.name}
                    status={r.status}
                    template={r.template?.name ?? null}
                    segment={r.segment?.name ?? null}
                    scheduledAt={r.scheduledAt}
                    aiPersonalize={!!r.config?.aiPersonalize}
                    target={reachableBySegment.get(r.segment?.id ?? "") || null}
                    stats={r.metrics}
                    canEdit={["DRAFT", "SCHEDULED", "PAUSED"].includes(r.status)}
                    canDelete={["DRAFT", "CANCELLED"].includes(r.status)}
                    onOpen={() => router.push(`/campaigns/${r.id}`)}
                    onStats={() => router.push(`/campaigns/${r.id}`)}
                    onEdit={() => router.push(`/campaigns/${r.id}/edit`)}
                    onLaunch={r.status === "DRAFT" || r.status === "PAUSED" ? () => void act(r.id, r.status === "PAUSED" ? "resume" : "schedule", "C'est parti") : undefined}
                    onPause={r.status === "SCHEDULED" || r.status === "SENDING" ? () => void act(r.id, "pause", "Campagne en pause") : undefined}
                    onDelete={() => confirmDelete(r)}
                  />
                </Col>
              ))}
            </Row>
          )}

          {visible.length > pageSize && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Pagination current={page} pageSize={pageSize} total={visible.length} onChange={setPage} showSizeChanger={false} />
            </div>
          )}
        </div>
      )}

      {tab === "segments" && (
        <div key="segments" className="nb-fade-up" style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "var(--nb-text-2)", fontSize: 13 }}>
              Un segment est une <b>audience dynamique</b> : les nouveaux leads qui correspondent aux critères y entrent automatiquement.
            </div>
            <Input prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />} placeholder="Rechercher un segment" allowClear value={segQuery} onChange={(e) => setSegQuery(e.target.value)} style={{ width: 240, marginLeft: "auto" }} />
          </div>
          {loading ? (
            <Panel><Skeleton active /></Panel>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 14 }} className="nb-stagger">
              <Link
                href="/campaigns/segments/new"
                className="nb-lift"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 190, borderRadius: 20, border: "1.5px dashed var(--nb-border-strong)", color: "var(--nb-text-2)", fontWeight: 600 }}
              >
                <span style={{ width: 46, height: 46, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", background: palette.gradientSoft, color: palette.violet, fontSize: 20 }}><PlusOutlined /></span>
                Nouveau segment
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--nb-text-3)" }}>avec aperçu de l&apos;audience en direct</span>
              </Link>
              {filteredSegments.map((s) => {
                const crit = describeFilters(s.filters);
                const pct = s.leadCount ? Math.round(((s.reachable ?? 0) / s.leadCount) * 100) : 0;
                return (
                  <div key={s.id} className="nb-glass nb-lift" onClick={() => router.push(`/campaigns/segments/${s.id}`)} style={{ borderRadius: 20, padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, position: "relative", overflow: "hidden" }}>
                    <div aria-hidden style={{ position: "absolute", top: -60, right: -60, width: 150, height: 150, borderRadius: "50%", background: `radial-gradient(circle, ${palette.cyan}22, transparent 70%)` }} />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="nb-display" style={{ fontWeight: 650, fontSize: 15.5, color: "var(--nb-text-strong)" }}>{s.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", marginTop: 2 }}>{s.campaigns ? `${s.campaigns} campagne${s.campaigns > 1 ? "s" : ""}` : "Pas encore utilisé"} · {dayjs(s.createdAt).format("DD/MM/YY")}</div>
                      </div>
                      <Tooltip title="Part des leads du segment qui ont un email valide hors blacklist">
                        <span><Chip size="sm" color={pct >= 80 ? palette.green : pct >= 50 ? palette.amber : palette.red}>{pct} % joignables</Chip></span>
                      </Tooltip>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span className="nb-display nb-mono" style={{ fontSize: 34, fontWeight: 800, color: palette.cyan, lineHeight: 1 }}>{s.reachable ?? 0}</span>
                      <span style={{ fontSize: 12.5, color: "var(--nb-text-3)" }}>joignables sur {s.leadCount ?? 0} leads</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1, alignContent: "flex-start" }}>
                      {crit.length === 0 ? <Chip size="sm" color="#94a0bd">Tous les leads</Chip> : crit.map((c) => <Chip key={c} size="sm" color={palette.violet}>{c}</Chip>)}
                    </div>
                    <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <Link href={`/campaigns/segments/${s.id}`} style={{ flex: 1 }}><Button block icon={<EditOutlined />}>Critères</Button></Link>
                      <Link href={`/campaigns/new?segment=${s.id}`} style={{ flex: 1 }}><Button block type="primary" icon={<RocketOutlined />} disabled={!s.reachable}>Campagne</Button></Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "performance" && (
        <div key="performance" className="nb-fade-up">
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Panel icon={<FunnelPlotOutlined />} title="Entonnoir d'engagement" subtitle="Toutes campagnes confondues — contacts uniques" style={{ height: "100%" }}>
                <Funnel
                  steps={[
                    { label: "Envoyés", value: totals.sent, color: palette.violet },
                    { label: "Ouverts", value: totals.opens, color: palette.cyan },
                    { label: "Cliqués", value: totals.clicks, color: palette.pink },
                    { label: "Réponses", value: totals.replies, color: palette.green },
                  ]}
                />
              </Panel>
            </Col>
            <Col xs={24} xl={10}>
              <Panel icon={<SafetyCertificateOutlined />} title="Délivrabilité" subtitle="Bounces et désabonnements (RFC 8058)" accent={palette.amber} style={{ height: "100%" }}>
                <div style={{ display: "grid", gap: 16 }}>
                  {[
                    { label: "Taux de bounce", value: rate(totals.bounces, totals.sent), n: totals.bounces, color: palette.amber, good: 2 },
                    { label: "Taux de désabonnement", value: rate(totals.unsubscribes, totals.sent), n: totals.unsubscribes, color: palette.red, good: 0.5 },
                  ].map((m) => (
                    <div key={m.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                        <span style={{ color: "var(--nb-text-2)" }}>{m.label} <span style={{ color: "var(--nb-text-3)", fontSize: 11.5 }}>(seuil sain ≤ {m.good} %)</span></span>
                        <span className="nb-mono" style={{ color: m.value <= m.good ? palette.green : m.color, fontWeight: 700 }}>{m.value} % <span style={{ color: "var(--nb-text-3)", fontWeight: 400 }}>({m.n})</span></span>
                      </div>
                      <div style={{ height: 8, borderRadius: 8, background: "var(--nb-control)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, m.value * 10)}%`, height: "100%", background: m.value <= m.good ? palette.green : m.color, borderRadius: 8, transformOrigin: "left", animation: "nb-grow-x 1s var(--nb-ease) both" }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--nb-text-3)", lineHeight: 1.6 }}>
                    Lien de désabonnement en un clic sur chaque email, blacklist automatique après bounce dur ou désinscription, envoi régulé par lots.
                  </div>
                </div>
              </Panel>
            </Col>
            <Col xs={24}>
              <Panel icon={<TrophyOutlined />} title="Classement des campagnes" subtitle="Par taux de réponse" accent={palette.amber}>
                {ranking.length === 0 ? (
                  <div style={{ color: "var(--nb-text-3)", fontSize: 13 }}>Aucune campagne n&apos;a encore envoyé d&apos;email.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {ranking.map((c, i) => {
                      const rr = rate(c.metrics.replies, c.metrics.sent);
                      const best = rate(ranking[0]!.metrics.replies, ranking[0]!.metrics.sent) || 1;
                      return (
                        <Link key={c.id} href={`/campaigns/${c.id}`} style={{ display: "grid", gridTemplateColumns: "34px minmax(160px, 1.2fr) 3fr 150px", gap: 14, alignItems: "center", color: "inherit" }}>
                          <span style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: i < 3 ? "#fff" : "var(--nb-text-2)", background: i === 0 ? palette.amber : i === 1 ? "#94a3b8" : i === 2 ? "#f97316" : "var(--nb-control)" }}>{i + 1}</span>
                          <span style={{ fontWeight: 600, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                          <div style={{ height: 10, borderRadius: 10, background: "var(--nb-control)", overflow: "hidden" }}>
                            <div style={{ width: `${(rr / best) * 100}%`, height: "100%", borderRadius: 10, background: `linear-gradient(90deg, ${palette.green}, ${palette.cyan})`, transformOrigin: "left", animation: `nb-grow-x .9s var(--nb-ease) ${i * 0.06}s both` }} />
                          </div>
                          <span className="nb-mono" style={{ fontSize: 12.5, color: "var(--nb-text-2)", textAlign: "right" }}>
                            <b style={{ color: palette.green }}>{rr} %</b> · {c.metrics.replies}/{c.metrics.sent}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
}
