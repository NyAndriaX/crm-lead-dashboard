"use client";

/** Page d'une séquence : parcours avec la position des leads, inscription inline (segment ou leads), liste des inscrits. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Col, Dropdown, Input, Modal, Row, Segmented, Select, Skeleton, Spin, Table, Tooltip, message } from "antd";
import {
  ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, DeleteOutlined, EditOutlined, EllipsisOutlined, MailOutlined,
  PauseOutlined, PlayCircleOutlined, SearchOutlined, SendOutlined, StopOutlined, TeamOutlined, TrophyOutlined, UserAddOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { StatCard } from "@/components/ui/StatCard";
import { Chip, EmptyState, Panel } from "@/components/ui/Kit";
import { describeFilters } from "@/components/campaigns/SegmentFilterBuilder";
import type { SegmentRow } from "@/components/campaigns/types";
import { SEQ_LEAD_STATUS, STOP_REASON, stepDays, type SequenceLeadRow, type SequenceRow } from "./types";

dayjs.extend(relativeTime);
dayjs.locale("fr");

type LeadOpt = { id: string; firstName: string | null; lastName: string | null; company: string | null };
const leadName = (l: { firstName: string | null; lastName: string | null; company: string | null }) =>
  [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "(sans nom)";

function EnrollPanel({ sequenceId, onDone }: { sequenceId: string; onDone: () => void }) {
  const [mode, setMode] = useState<"segment" | "leads">("segment");
  const [segments, setSegments] = useState<SegmentRow[] | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [options, setOptions] = useState<LeadOpt[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<{ data: SegmentRow[] }>("/segments?counts=1").then((r) => setSegments(r.data.data)).catch(() => setSegments([]));
  }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearching(true);
      api
        .get<{ data: LeadOpt[] }>(`/leads?pageSize=50${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => setOptions(r.data.data))
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 300);
  };

  useEffect(() => search(""), []); // premiers leads proposés sans saisie

  const enroll = async () => {
    setBusy(true);
    try {
      const body = mode === "segment" ? { segmentId } : { leadIds: picked };
      const r = await api.post<{ data: { enrolled: number; skipped: number } }>(`/sequences/${sequenceId}/leads`, body);
      const { enrolled, skipped } = r.data.data;
      message.success(`${enrolled} lead(s) inscrit(s)${skipped ? ` · ${skipped} déjà dans la séquence` : ""}`);
      setPicked([]);
      setSegmentId(null);
      onDone();
    } catch {
      message.error("Inscription impossible");
    } finally {
      setBusy(false);
    }
  };

  const seg = segments?.find((s) => s.id === segmentId);
  const disabled = mode === "segment" ? !segmentId || !seg?.reachable : picked.length === 0;

  return (
    <Panel icon={<UserAddOutlined />} title="Inscrire des leads" subtitle="Le premier email part selon le délai de l'étape 1" accent={palette.cyan}>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <Segmented block value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "segment", label: "Tout un segment" }, { value: "leads", label: "Des leads précis" }]} />
        {mode === "segment" ? (
          segments === null ? <Skeleton active paragraph={{ rows: 3 }} /> : segments.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--nb-text-3)" }}>Aucun segment. <Link href="/campaigns/segments/new">Créer un segment</Link></div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 300, overflow: "auto" }}>
              {segments.map((s) => {
                const active = s.id === segmentId;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSegmentId(s.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSegmentId(s.id); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, cursor: "pointer",
                      border: `1.5px solid ${active ? palette.cyan : "var(--nb-border)"}`, background: active ? `${palette.cyan}12` : "var(--nb-control)",
                    }}
                  >
                    {active ? <CheckCircleFilled style={{ color: palette.cyan, fontSize: 18 }} /> : <TeamOutlined style={{ color: "var(--nb-text-3)", fontSize: 16 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{describeFilters(s.filters).join(" · ") || "Tous les leads"}</div>
                    </div>
                    <span className="nb-mono" style={{ fontWeight: 700, color: palette.cyan }}>{s.reachable ?? 0}</span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <Select
            mode="multiple"
            showSearch
            filterOption={false}
            onSearch={search}
            notFoundContent={searching ? <Spin size="small" /> : "Aucun lead"}
            placeholder="Rechercher par nom, entreprise…"
            value={picked}
            onChange={setPicked}
            options={options.map((l) => ({ value: l.id, label: `${leadName(l)}${l.company && leadName(l) !== l.company ? ` — ${l.company}` : ""}` }))}
            maxTagCount="responsive"
            style={{ width: "100%" }}
          />
        )}
        <Button type="primary" icon={<UserAddOutlined />} block loading={busy} disabled={disabled} onClick={() => void enroll()}>
          {mode === "segment" ? (seg ? `Inscrire les ${seg.reachable ?? 0} leads joignables` : "Choisissez un segment") : `Inscrire ${picked.length || ""} lead${picked.length > 1 ? "s" : ""}`}
        </Button>
        <div style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>Les leads déjà en cours dans cette séquence sont ignorés : aucun doublon d&apos;envoi.</div>
      </div>
    </Panel>
  );
}

export function SequenceDetail({ sequenceId }: { sequenceId: string }) {
  const router = useRouter();
  const [modal, modalHolder] = Modal.useModal();
  const [seq, setSeq] = useState<SequenceRow | null>(null);
  const [leads, setLeads] = useState<SequenceLeadRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.get<{ data: SequenceRow }>(`/sequences/${sequenceId}`),
        api.get<{ data: SequenceLeadRow[] }>(`/sequences/${sequenceId}/leads`),
      ]);
      setSeq(s.data.data);
      setLeads(l.data.data);
    } catch {
      setMissing(true);
    }
  }, [sequenceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = leads ?? [];
    const by = (st: string) => list.filter((l) => l.status === st).length;
    const atStep = (seq?.steps ?? []).map((_, i) => list.filter((l) => l.status === "active" && l.currentStep === i).length);
    const reasons: Record<string, number> = {};
    for (const l of list) if (l.status === "stopped" && l.stoppedReason) reasons[l.stoppedReason] = (reasons[l.stoppedReason] ?? 0) + 1;
    const next = list.filter((l) => l.status === "active" && l.nextSendAt).map((l) => l.nextSendAt!).sort()[0] ?? null;
    return {
      total: list.length, active: by("active"), completed: by("completed"), stopped: by("stopped"),
      sent: list.reduce((n, l) => n + l.sentCount, 0), replies: reasons.reply ?? 0, atStep, reasons, next,
    };
  }, [leads, seq]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter(
      (l) => (statusFilter === "all" || l.status === statusFilter) && (!q || `${leadName(l.lead)} ${l.lead.company ?? ""}`.toLowerCase().includes(q)),
    );
  }, [leads, statusFilter, query]);

  const togglePause = async () => {
    if (!seq) return;
    try {
      await api.patch(`/sequences/${sequenceId}`, { isPaused: !seq.isPaused });
      message.success(seq.isPaused ? "Séquence relancée" : "Séquence en pause — aucun envoi tant qu'elle n'est pas relancée");
      void load();
    } catch {
      message.error("Action impossible");
    }
  };

  const unenroll = (l: SequenceLeadRow) => {
    void modal.confirm({
      title: `Retirer ${leadName(l.lead)} de la séquence ?`,
      content: "Plus aucune relance ne lui sera envoyée.",
      okText: "Retirer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        await api.delete(`/sequences/${sequenceId}/leads`, { data: { leadId: l.leadId } });
        message.success("Lead retiré");
        void load();
      },
    });
  };

  const remove = () => {
    void modal.confirm({
      title: `Supprimer « ${seq?.name} » ?`,
      content: "Les leads inscrits sortent de la séquence ; leur historique d'emails est conservé.",
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        await api.delete(`/sequences/${sequenceId}`);
        message.success("Séquence supprimée");
        router.push("/sequences");
      },
    });
  };

  if (missing) return <Panel><EmptyState title="Séquence introuvable" action={<Link href="/sequences"><Button>Retour aux relances</Button></Link>} /></Panel>;
  if (!seq || !leads) return <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>;

  const days = stepDays(seq.steps);
  const maxAtStep = Math.max(1, ...stats.atStep);

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}
      <div className="nb-fade-up" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <Link href="/sequences"><Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" /></Link>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <Chip color={seq.isPaused ? palette.amber : palette.green} dot pulse={!seq.isPaused}>{seq.isPaused ? "En pause" : "Active"}</Chip>
            <Chip color={palette.violet}><MailOutlined /> {seq.steps.length} email(s) · J+{days[days.length - 1] ?? 0}</Chip>
            {seq.steps.some((s) => s.aiPersonalize) && <AIBadge>Réécrite par l'IA</AIBadge>}
          </div>
          <div className="nb-display" style={{ fontSize: 26, fontWeight: 700, color: "var(--nb-text-strong)" }}>{seq.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/sequences/${sequenceId}/edit`}><Button icon={<EditOutlined />}>Modifier le parcours</Button></Link>
          <Button type={seq.isPaused ? "primary" : "default"} icon={seq.isPaused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={() => void togglePause()}>
            {seq.isPaused ? "Relancer" : "Mettre en pause"}
          </Button>
          <Dropdown trigger={["click"]} menu={{ items: [{ key: "delete", icon: <DeleteOutlined />, label: "Supprimer", danger: true, onClick: remove }] }}>
            <Button icon={<EllipsisOutlined />} aria-label="Plus d'actions" />
          </Dropdown>
        </div>
      </div>

      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={24} sm={12} xl={6}><StatCard label="En parcours" value={stats.active} icon={<TeamOutlined />} color={palette.cyan} hint={`${stats.total} inscrit(s) au total`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Relances envoyées" value={stats.sent} icon={<SendOutlined />} color={palette.violet} hint={stats.next ? `prochain envoi ${dayjs(stats.next).fromNow()}` : "aucun envoi planifié"} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Ont répondu" value={stats.replies} icon={<TrophyOutlined />} color={palette.green} hint={stats.total ? `${Math.round((stats.replies / stats.total) * 100)} % des inscrits` : "objectif de la séquence"} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Parcours terminés" value={stats.completed} icon={<CheckCircleFilled />} color={palette.pink} hint={`${stats.stopped} arrêté(s)`} /></Col>
      </Row>

      <Row gutter={[20, 20]} align="top">
        <Col xs={24} xl={15}>
          <Panel icon={<ClockCircleOutlined />} title="Où en sont les leads ?" subtitle="Leads actifs en attente de chaque email">
            <div style={{ display: "grid", gap: 10 }}>
              {seq.steps.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "54px minmax(0, 1.3fr) 2fr 44px", gap: 14, alignItems: "center" }}>
                  <span className="nb-mono" style={{ fontWeight: 700, color: palette.cyan }}>J+{days[i]}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, color: "var(--nb-text-strong)" }}>{i === 0 ? "Premier email" : `Relance ${i}`}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.subject || "Objet du template"}{s.aiPersonalize ? " · ✦ IA" : ""}{s.stopOnReply !== false ? " · stop si réponse" : ""}
                    </span>
                  </span>
                  <div style={{ height: 12, borderRadius: 12, background: "var(--nb-control)", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.atStep[i]! / maxAtStep) * 100}%`, height: "100%", borderRadius: 12, background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`, transformOrigin: "left", animation: `nb-grow-x .9s var(--nb-ease) ${i * 0.06}s both` }} />
                  </div>
                  <span className="nb-mono" style={{ textAlign: "right", fontWeight: 700, color: "var(--nb-text-strong)" }}>{stats.atStep[i]}</span>
                </div>
              ))}
              {Object.keys(stats.reasons).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--nb-border)" }}>
                  <span style={{ fontSize: 12, color: "var(--nb-text-3)", marginRight: 4 }}><StopOutlined /> Sorties anticipées :</span>
                  {Object.entries(stats.reasons).map(([k, n]) => (
                    <Chip key={k} size="sm" color={k === "reply" ? palette.green : k === "manual" ? "#94a0bd" : palette.red}>{STOP_REASON[k] ?? (k.startsWith("send_failed") ? "Échec d'envoi" : k)} · {n}</Chip>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel
            icon={<TeamOutlined />}
            title="Leads inscrits"
            subtitle={`${visible.length} / ${leads.length}`}
            accent={palette.pink}
            style={{ marginTop: 20 }}
            extra={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Segmented
                  size="small"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(String(v))}
                  options={[{ value: "all", label: "Tous" }, ...Object.entries(SEQ_LEAD_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
                />
                <Input size="small" prefix={<SearchOutlined />} placeholder="Rechercher" allowClear value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 170 }} />
              </div>
            }
          >
            <Table<SequenceLeadRow>
              rowKey="id"
              size="small"
              dataSource={visible}
              pagination={visible.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
              locale={{ emptyText: leads.length ? "Aucun lead pour ce filtre" : "Aucun lead inscrit — utilisez le panneau « Inscrire des leads »" }}
              columns={[
                {
                  title: "Lead",
                  key: "lead",
                  render: (_: unknown, r) => (
                    <Link href={`/leads/${r.lead.id}`} style={{ display: "grid" }}>
                      <span style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{leadName(r.lead)}</span>
                      <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>{r.lead.company ?? ""}</span>
                    </Link>
                  ),
                },
                {
                  title: "Progression",
                  key: "step",
                  width: 150,
                  render: (_: unknown, r) => (
                    <div style={{ display: "flex", gap: 3 }}>
                      {seq.steps.map((_s, i) => (
                        <Tooltip key={i} title={`${i === 0 ? "Premier email" : `Relance ${i}`}${i < r.sentCount ? " — envoyé" : ""}`}>
                          <span style={{ flex: 1, height: 6, borderRadius: 4, background: i < r.sentCount ? palette.violet : i === r.currentStep && r.status === "active" ? `${palette.cyan}88` : "var(--nb-border-strong)" }} />
                        </Tooltip>
                      ))}
                    </div>
                  ),
                },
                {
                  title: "Statut",
                  key: "status",
                  width: 170,
                  render: (_: unknown, r) => {
                    const st = SEQ_LEAD_STATUS[r.status] ?? { label: r.status, color: "#94a0bd" };
                    return (
                      <div style={{ display: "grid", gap: 2 }}>
                        <span><Chip size="sm" color={st.color} dot>{st.label}</Chip></span>
                        {r.stoppedReason && <span style={{ fontSize: 11, color: "var(--nb-text-3)" }}>{STOP_REASON[r.stoppedReason] ?? r.stoppedReason}</span>}
                      </div>
                    );
                  },
                },
                {
                  title: "Prochain envoi",
                  dataIndex: "nextSendAt",
                  width: 150,
                  render: (v: string | null, r) => (r.status === "active" && v ? <Tooltip title={dayjs(v).format("DD/MM/YYYY HH:mm")}>{dayjs(v).fromNow()}</Tooltip> : "—"),
                },
                {
                  title: "",
                  key: "actions",
                  width: 50,
                  render: (_: unknown, r) =>
                    r.status === "active" || r.status === "paused" ? (
                      <Tooltip title="Retirer de la séquence"><Button size="small" type="text" danger icon={<StopOutlined />} onClick={() => unenroll(r)} /></Tooltip>
                    ) : null,
                },
              ]}
            />
          </Panel>
        </Col>
        <Col xs={24} xl={9}>
          <div style={{ position: "sticky", top: 96 }}>
            <EnrollPanel sequenceId={sequenceId} onDone={() => void load()} />
          </div>
        </Col>
      </Row>
    </div>
  );
}
