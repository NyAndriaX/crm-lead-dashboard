"use client";

/**
 * Page /analytics — module Analytique & Reporting (AN-01 → AN-05).
 *
 * Onglets :
 *  - Vue globale   : KPIs synthétiques par période (AN-01)
 *  - Campagnes     : performance détaillée par campagne (AN-02)
 *  - Leads timeline: évolution dans le temps + courbe par source (AN-03)
 *  - Performance   : leads/conversions par commercial (AN-04)
 *  - Export        : téléchargement XLSX/CSV (AN-05)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Button, Card, Col, Empty, Progress, Row, Segmented, Space, Spin, Table, Tag, Typography, message,
} from "antd";
import {
  BarChartOutlined, DollarOutlined, DownloadOutlined, FireOutlined,
  LineChartOutlined, MailOutlined, RiseOutlined, TeamOutlined,
  TrophyOutlined, UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { palette } from "@/lib/theme";
import { useThemeMode } from "@/components/ThemeProvider";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Chip, EmptyState, Panel, ScoreRing } from "@/components/ui/Kit";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon", SCHEDULED: "Planifiée", SENDING: "En cours", PAUSED: "En pause", DONE: "Terminée", CANCELLED: "Annulée",
};

/** Taux en barre colorée (tableaux). */
function RateBar({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <span style={{ color: "var(--nb-text-3)" }}>—</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <div style={{ width: 54, height: 6, borderRadius: 6, background: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
      <span className="nb-mono" style={{ color, fontWeight: 700, fontSize: 12, width: 44, textAlign: "right" }}>{value}%</span>
    </div>
  );
}

/** Thème G2 (sombre ou clair selon le mode) + palette Nebula, partagé par les graphiques. */
function useChartTheme() {
  const { mode } = useThemeMode();
  return {
    theme: mode === "dark" ? "classicDark" : "classic",
    scale: { color: { range: [palette.cyan, palette.violet, palette.pink, palette.green, palette.amber, palette.blue] } },
  } as const;
}

const { Text } = Typography;

const Column = dynamic(() => import("@ant-design/charts").then((m) => m.Column), { ssr: false });
const Line = dynamic(() => import("@ant-design/charts").then((m) => m.Line), { ssr: false });
const Pie = dynamic(() => import("@ant-design/charts").then((m) => m.Pie), { ssr: false });

type Period = "7d" | "30d" | "90d" | "ytd" | "all";
type Granularity = "day" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
  ytd: "Cette année",
  all: "Tout",
};

// ─── AN-01 — Vue globale ─────────────────────────────────────────────────────

type GlobalKpis = {
  period: Period;
  leadsTotal: number;
  leadsActive: number;
  leadsCreated: number;
  emailsSent: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
  conversionRate: number | null;
  inboxMessagesReceived: number;
  campaignsActive: number;
};

function GlobalView({ period }: { period: Period }) {
  const [kpis, setKpis] = useState<GlobalKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: GlobalKpis }>(`/analytics/global?period=${period}`);
      setKpis(data.data);
    } catch {
      message.error("Impossible de charger les KPIs.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void fetchKpis(); }, [fetchKpis]);

  if (loading) return <div style={{ padding: 48, textAlign: "center" }}><Spin /></div>;
  if (!kpis) return <Empty />;

  const rings = [
    { label: "Ouverture", value: kpis.openRate, color: palette.cyan },
    { label: "Clic", value: kpis.clickRate, color: palette.violet },
    { label: "Réponse", value: kpis.replyRate, color: palette.green },
    { label: "Bounce", value: kpis.bounceRate, color: palette.amber },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={12} xl={6}><StatCard label="Leads (total)" value={kpis.leadsTotal} icon={<TeamOutlined />} color={palette.violet} hint={`dont ${kpis.leadsActive} actifs`} /></Col>
        <Col xs={12} xl={6}><StatCard label="Leads créés" value={kpis.leadsCreated} icon={<RiseOutlined />} color={palette.green} hint="sur la période" /></Col>
        <Col xs={12} xl={6}><StatCard label="Emails envoyés" value={kpis.emailsSent} icon={<MailOutlined />} color={palette.pink} hint={`${kpis.campaignsActive} campagne(s) active(s)`} /></Col>
        <Col xs={12} xl={6}><StatCard label="Conversion" value={kpis.conversionRate ?? 0} decimals={1} suffix="%" icon={<TrophyOutlined />} color={palette.amber} hint="taux global" /></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Panel icon={<MailOutlined />} title="Performance emailing" subtitle="Taux calculés sur les envois de la période" style={{ height: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {rings.map((r) => (
                <div key={r.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <ScoreRing score={r.value} size={104} color={r.color} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nb-text-2)" }}>{r.label}</div>
                </div>
              ))}
            </div>
          </Panel>
        </Col>
        <Col xs={24} lg={9}>
          <Panel icon={<FireOutlined />} title="Engagement" subtitle="Réponses et désabonnements" accent={palette.pink} style={{ height: "100%" }}>
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div className="nb-eyebrow">Réponses reçues</div>
                <AnimatedNumber value={kpis.inboxMessagesReceived} className="nb-display nb-mono" style={{ fontSize: 44, fontWeight: 700, color: palette.cyan }} />
                <div style={{ fontSize: 12, color: "var(--nb-text-3)" }}>relevées dans la boîte de réception et triées par l'IA</div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--nb-text-2)" }}>Taux de désabonnement</span>
                  <span className="nb-mono" style={{ fontWeight: 700, color: (kpis.unsubscribeRate ?? 0) <= 0.5 ? palette.green : palette.red }}>
                    {kpis.unsubscribeRate != null ? `${kpis.unsubscribeRate} %` : "—"}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 8, background: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (kpis.unsubscribeRate ?? 0) * 10)}%`, height: "100%", background: palette.red, borderRadius: 8, transformOrigin: "left", animation: "nb-grow-x 1s var(--nb-ease) both" }} />
                </div>
              </div>
            </div>
          </Panel>
        </Col>
      </Row>
    </div>
  );
}

// ─── AN-02 — Campagnes ───────────────────────────────────────────────────────

type CampaignReport = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubs: number;
  replies: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  ctorRate: number | null;
};

function CampaignsView() {
  const [rows, setRows] = useState<CampaignReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: CampaignReport[] }>("/analytics/campaigns");
      setRows(data.data);
    } catch {
      message.error("Impossible de charger les rapports campagne.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const totals = useMemo(() => {
    const sent = rows.reduce((a, b) => a + b.sent, 0);
    const opens = rows.reduce((a, b) => a + b.opens, 0);
    const clicks = rows.reduce((a, b) => a + b.clicks, 0);
    const replies = rows.reduce((a, b) => a + b.replies, 0);
    return {
      sent, opens, clicks, replies,
      openRate: sent > 0 ? Math.round((opens / sent) * 1000) / 10 : null,
      clickRate: sent > 0 ? Math.round((clicks / sent) * 1000) / 10 : null,
      replyRate: sent > 0 ? Math.round((replies / sent) * 1000) / 10 : null,
    };
  }, [rows]);

  const columns: ColumnsType<CampaignReport> = [
    {
      title: "Campagne",
      key: "name",
      fixed: "left",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(r.createdAt).toLocaleDateString("fr-FR")}
          </Text>
        </Space>
      ),
    },
    {
      title: "Statut",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v) => (
        <Chip size="sm" color={v === "DONE" ? palette.green : v === "SENDING" ? palette.cyan : v === "PAUSED" ? palette.amber : "#94a0bd"}>
          {CAMPAIGN_STATUS_LABEL[v] ?? v}
        </Chip>
      ),
    },
    { title: "Envoyés", dataIndex: "sent", key: "sent", width: 90, align: "right" },
    { title: "Délivrés", dataIndex: "delivered", key: "delivered", width: 90, align: "right" },
    { title: "Ouv.", dataIndex: "opens", key: "opens", width: 80, align: "right" },
    { title: "Clics", dataIndex: "clicks", key: "clicks", width: 80, align: "right" },
    { title: "Bounces", dataIndex: "bounces", key: "bounces", width: 90, align: "right" },
    { title: "Désabos", dataIndex: "unsubs", key: "unsubs", width: 90, align: "right" },
    { title: "Réponses", dataIndex: "replies", key: "replies", width: 90, align: "right" },
    {
      title: "Taux ouv.", dataIndex: "openRate", key: "openRate", width: 100, align: "right",
      render: (v) => <RateBar value={v} color={palette.cyan} />,
    },
    {
      title: "Taux clic", dataIndex: "clickRate", key: "clickRate", width: 100, align: "right",
      render: (v) => <RateBar value={v} color={palette.pink} />,
    },
    {
      title: "CTOR", dataIndex: "ctorRate", key: "ctorRate", width: 90, align: "right",
      render: (v) => v != null ? <Text>{v}%</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Réponses", dataIndex: "replyRate", key: "replyRate", width: 100, align: "right",
      render: (v) => <RateBar value={v} color={palette.green} />,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={12} xl={6}><StatCard label="Total envoyés" value={totals.sent} icon={<MailOutlined />} color={palette.violet} /></Col>
        <Col xs={12} xl={6}><StatCard label="Ouverture" value={totals.openRate ?? 0} decimals={1} suffix="%" icon={<RiseOutlined />} color={palette.cyan} /></Col>
        <Col xs={12} xl={6}><StatCard label="Clic" value={totals.clickRate ?? 0} decimals={1} suffix="%" icon={<FireOutlined />} color={palette.pink} /></Col>
        <Col xs={12} xl={6}><StatCard label="Réponse" value={totals.replyRate ?? 0} decimals={1} suffix="%" icon={<TrophyOutlined />} color={palette.green} /></Col>
      </Row>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="middle"
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 15, showTotal: (t) => `${t} campagne(s)` }}
      />
    </Space>
  );
}

// ─── AN-03 — Évolution leads ─────────────────────────────────────────────────

type TimelineBucket = {
  period: string;
  total: number;
  bySource: Record<string, number>;
};

function TimelineView({ period }: { period: Period }) {
  const chartTheme = useChartTheme();
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: { buckets: TimelineBucket[]; sources: string[] } }>(
        `/analytics/leads-timeline?period=${period}&granularity=${granularity}`,
      );
      setBuckets(data.data.buckets);
      setSources(data.data.sources);
    } catch {
      message.error("Impossible de charger l'évolution.");
    } finally {
      setLoading(false);
    }
  }, [period, granularity]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const lineData = useMemo(() => {
    const out: { period: string; source: string; count: number }[] = [];
    for (const b of buckets) {
      for (const src of sources) {
        out.push({ period: b.period, source: src, count: b.bySource[src] ?? 0 });
      }
    }
    return out;
  }, [buckets, sources]);

  const pieData = useMemo(() => {
    const acc = new Map<string, number>();
    for (const b of buckets) {
      for (const [src, n] of Object.entries(b.bySource)) {
        acc.set(src, (acc.get(src) ?? 0) + n);
      }
    }
    return Array.from(acc.entries()).map(([source, count]) => ({ source, count }));
  }, [buckets]);

  const total = buckets.reduce((a, b) => a + b.total, 0);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space>
          <Text strong>Granularité :</Text>
          <Segmented<Granularity>
            value={granularity}
            onChange={(v) => setGranularity(v as Granularity)}
            options={[
              { label: "Jour", value: "day" },
              { label: "Semaine", value: "week" },
              { label: "Mois", value: "month" },
            ]}
          />
          <Text type="secondary" style={{ marginLeft: 16 }}>
            {total} lead(s) créé(s) sur la période sélectionnée
          </Text>
        </Space>
      </Card>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}><Spin /></div>
      ) : buckets.length === 0 ? (
        <Empty description="Aucun lead sur la période" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card title="Évolution des leads par source">
              <Line
                {...chartTheme}
                data={lineData}
                xField="period"
                yField="count"
                colorField="source"
                point={{ size: 4 }}
                height={320}
                smooth
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="Répartition par source (cumul)">
              <Pie
                {...chartTheme}
                data={pieData}
                angleField="count"
                colorField="source"
                radius={0.85}
                innerRadius={0.55}
                legend={{ position: "bottom" }}
                height={320}
              />
            </Card>
          </Col>
          <Col xs={24}>
            <Card title="Volume par période">
              <Column
                {...chartTheme}
                data={buckets.map((b) => ({ period: b.period, total: b.total }))}
                xField="period"
                yField="total"
                height={200}
                style={{ fill: palette.violet, radiusTopLeft: 6, radiusTopRight: 6 }}
              />
            </Card>
          </Col>
        </Row>
      )}
    </Space>
  );
}

// ─── AN-04 — Performance commerciale ─────────────────────────────────────────

type SalesPerf = {
  userId: string;
  userName: string;
  userEmail: string;
  teamId: string | null;
  leadsAssigned: number;
  leadsContacted: number;
  leadsQualified: number;
  leadsConverted: number;
  leadsLost: number;
  conversionRate: number | null;
  avgScore: number | null;
  repliesReceived: number;
};

function SalesView({ period }: { period: Period }) {
  const chartTheme = useChartTheme();
  const [rows, setRows] = useState<SalesPerf[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: SalesPerf[] }>(
        `/analytics/sales-performance?period=${period}`,
      );
      setRows(data.data);
    } catch {
      message.error("Impossible de charger la performance commerciale.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const chartData = useMemo(() => {
    const out: { user: string; metric: string; count: number }[] = [];
    for (const r of rows) {
      out.push({ user: r.userName, metric: "Assignés", count: r.leadsAssigned });
      out.push({ user: r.userName, metric: "Convertis", count: r.leadsConverted });
      out.push({ user: r.userName, metric: "Perdus", count: r.leadsLost });
    }
    return out;
  }, [rows]);

  const columns: ColumnsType<SalesPerf> = [
    {
      title: "Commercial",
      key: "user",
      fixed: "left",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.userName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.userEmail}</Text>
        </Space>
      ),
    },
    {
      title: "Assignés",
      dataIndex: "leadsAssigned",
      key: "assigned",
      width: 110,
      align: "right",
      render: (v) => <Tag color={v > 0 ? "blue" : "default"}>{v}</Tag>,
    },
    { title: "Contactés", dataIndex: "leadsContacted", key: "contacted", width: 110, align: "right" },
    { title: "Qualifiés", dataIndex: "leadsQualified", key: "qualified", width: 110, align: "right" },
    {
      title: "Convertis", dataIndex: "leadsConverted", key: "converted", width: 110, align: "right",
      render: (v: number) => <Tag color={v > 0 ? "green" : "default"}>{v}</Tag>,
    },
    {
      title: "Perdus", dataIndex: "leadsLost", key: "lost", width: 110, align: "right",
      render: (v: number) => <Tag color={v > 0 ? "red" : "default"}>{v}</Tag>,
    },
    {
      title: "Taux conv.", dataIndex: "conversionRate", key: "conv", width: 120, align: "right",
      render: (v) => v != null
        ? <Progress percent={v} size="small" status={v >= 25 ? "success" : v >= 10 ? "active" : "normal"} />
        : "—",
    },
    {
      title: "Score moy.", dataIndex: "avgScore", key: "score", width: 110, align: "right",
      render: (v) => v != null ? <Tag color={v >= 60 ? "green" : v >= 40 ? "blue" : "default"}>{v}</Tag> : "—",
    },
    {
      title: "Réponses reçues", dataIndex: "repliesReceived", key: "replies", width: 140, align: "right",
      render: (v: number) => <Tag color={v > 0 ? "cyan" : "default"}>{v}</Tag>,
    },
  ];

  const ranked = [...rows].sort((x, y) => y.leadsConverted - x.leadsConverted || (y.conversionRate ?? 0) - (x.conversionRate ?? 0));
  const maxAssigned = Math.max(1, ...rows.map((r) => r.leadsAssigned));
  const MEDALS = ["#fbbf24", "#cbd5e1", "#f97316"];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel icon={<TrophyOutlined />} title="Classement des commerciaux" subtitle="Trié par leads convertis sur la période" accent={palette.amber}>
        {loading ? (
          <Spin />
        ) : ranked.length === 0 ? (
          <EmptyState title="Aucune donnée" description="Assignez des leads aux commerciaux pour suivre leur performance." />
        ) : (
          <div style={{ display: "grid", gap: 10 }} className="nb-stagger">
            {ranked.map((r, i) => (
              <div
                key={r.userId}
                style={{
                  display: "grid", gridTemplateColumns: "44px minmax(160px, 1.2fr) minmax(200px, 2fr) 90px 90px", gap: 16, alignItems: "center",
                  padding: "12px 16px", borderRadius: 16, border: "1px solid var(--nb-border)",
                  background: i === 0 ? "linear-gradient(90deg, rgba(251,191,36,0.14), transparent)" : "var(--nb-control)",
                }}
              >
                <div
                  className="nb-mono"
                  style={{
                    width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                    color: i < 3 ? "#1e2538" : "var(--nb-text-2)", background: i < 3 ? MEDALS[i] : "rgba(148,163,184,0.15)",
                    boxShadow: i < 3 ? `0 0 16px -2px ${MEDALS[i]}` : "none",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{r.userName}</div>
                  <div style={{ fontSize: 12, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.userEmail}</div>
                </div>
                <div style={{ display: "grid", gap: 5 }}>
                  {[
                    { label: "Assignés", v: r.leadsAssigned, c: palette.violet },
                    { label: "Convertis", v: r.leadsConverted, c: palette.green },
                    { label: "Perdus", v: r.leadsLost, c: palette.red },
                  ].map((m) => (
                    <div key={m.label} style={{ display: "grid", gridTemplateColumns: "70px 1fr 28px", gap: 8, alignItems: "center", fontSize: 11 }}>
                      <span style={{ color: "var(--nb-text-3)" }}>{m.label}</span>
                      <div style={{ height: 6, borderRadius: 6, background: "rgba(148,163,184,0.12)", overflow: "hidden" }}>
                        <div style={{ width: `${(m.v / maxAssigned) * 100}%`, height: "100%", background: m.c, borderRadius: 6, transformOrigin: "left", animation: "nb-grow-x 1s var(--nb-ease) both" }} />
                      </div>
                      <span className="nb-mono" style={{ color: "var(--nb-text-strong)", textAlign: "right" }}>{m.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "center" }}>
                  <ScoreRing score={r.conversionRate} size={54} color={palette.green} />
                  <div style={{ fontSize: 10, color: "var(--nb-text-3)", marginTop: 4 }}>conversion</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <ScoreRing score={r.avgScore} size={54} />
                  <div style={{ fontSize: 10, color: "var(--nb-text-3)", marginTop: 4 }}>score moyen</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {rows.length > 0 && (
        <Panel icon={<BarChartOutlined />} title="Volume par commercial" subtitle="Assignés, convertis et perdus">
          <Column {...chartTheme} data={chartData} xField="user" yField="count" colorField="metric" group height={280} />
        </Panel>
      )}

      <Panel icon={<UserOutlined />} title="Détail" subtitle="Toutes les métriques par commercial" padding={8}>
        <Table rowKey="userId" columns={columns} dataSource={rows} loading={loading} size="middle" scroll={{ x: 1100 }} pagination={false} />
      </Panel>
    </div>
  );
}

// ─── AN-05 — Export ──────────────────────────────────────────────────────────

function ExportView({ period }: { period: Period }) {
  const reports = [
    { key: "global", title: "KPIs globaux", desc: "Synthèse complète : leads, emailing, conversions.", icon: <DollarOutlined /> },
    { key: "campaigns", title: "Rapports campagnes", desc: "Détail par campagne (envoyés/ouverts/cliqués/réponses).", icon: <MailOutlined /> },
    { key: "leads-timeline", title: "Évolution leads", desc: "Volumes par période et par source.", icon: <LineChartOutlined /> },
    { key: "sales-performance", title: "Performance commerciale", desc: "Leads et taux par commercial.", icon: <UserOutlined /> },
  ];

  function doExport(reportKey: string, fmt: "xlsx" | "csv") {
    const url = `/api/analytics/export?report=${reportKey}&period=${period}&granularity=week&format=${fmt}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_self";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Row gutter={[16, 16]} className="nb-stagger">
        {reports.map((r, i) => {
          const c = [palette.violet, palette.cyan, palette.pink, palette.green][i % 4]!;
          return (
            <Col key={r.key} xs={24} md={12}>
              <div className="nb-glass nb-lift" style={{ borderRadius: 20, padding: 22, display: "flex", gap: 18, alignItems: "flex-start", height: "100%" }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", background: `linear-gradient(135deg, ${c}, ${palette.indigo})`, boxShadow: `0 10px 26px -10px ${c}` }}>
                  {r.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="nb-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--nb-text-strong)" }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: "var(--nb-text-3)", marginTop: 4 }}>{r.desc}</div>
                  <Space style={{ marginTop: 14 }}>
                    <Button icon={<DownloadOutlined />} type="primary" onClick={() => doExport(r.key, "xlsx")}>Excel</Button>
                    <Button icon={<DownloadOutlined />} onClick={() => doExport(r.key, "csv")}>CSV</Button>
                  </Space>
                </div>
              </div>
            </Col>
          );
        })}
      </Row>
      <div style={{ fontSize: 12, color: "var(--nb-text-3)" }}>
        Les exports utilisent la période sélectionnée en haut de page. L'envoi récurrent par email des rapports n'est pas encore disponible : lancez l'export à la demande.
      </div>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [activeTab, setActiveTab] = useState("global");

  return (
    <div>
      <PageHeader
        icon={<BarChartOutlined />}
        title="Analytique &"
        highlight="reporting"
        subtitle="Performance emailing, évolution des leads, conversion par commercial et exports."
        extra={
          <Space>
            <Text type="secondary">Période :</Text>
          <Segmented<Period>
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={(["7d", "30d", "90d", "ytd", "all"] as Period[]).map((p) => ({
              label: PERIOD_LABELS[p],
              value: p,
            }))}
          />
          </Space>
        }
      />

      <div style={{ marginBottom: 18 }}>
        <Segmented
          size="large"
          value={activeTab}
          onChange={(v) => setActiveTab(String(v))}
          options={[
            { value: "global", label: <span><BarChartOutlined /> Vue globale</span> },
            { value: "campaigns", label: <span><MailOutlined /> Campagnes</span> },
            { value: "timeline", label: <span><LineChartOutlined /> Évolution des leads</span> },
            { value: "sales", label: <span><TrophyOutlined /> Commerciaux</span> },
            { value: "export", label: <span><DownloadOutlined /> Export</span> },
          ]}
        />
      </div>
      <div key={activeTab} className="nb-fade-up">
        {activeTab === "global" && <GlobalView period={period} />}
        {activeTab === "campaigns" && <CampaignsView />}
        {activeTab === "timeline" && <TimelineView period={period} />}
        {activeTab === "sales" && <SalesView period={period} />}
        {activeTab === "export" && <ExportView period={period} />}
      </div>
    </div>
  );
}
