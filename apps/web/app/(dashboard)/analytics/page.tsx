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
  Alert, Button, Card, Col, Empty, Progress, Row, Segmented,
  Space, Spin, Statistic, Table, Tag, Typography, Tabs, message,
} from "antd";
import {
  BarChartOutlined, DollarOutlined, DownloadOutlined, FireOutlined,
  LineChartOutlined, MailOutlined, RiseOutlined, TeamOutlined,
  TrophyOutlined, UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";

const { Title, Text } = Typography;

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

  const pct = (v: number | null) => v != null ? v : 0;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Leads (total)"
              value={kpis.leadsTotal}
              prefix={<TeamOutlined />}
              valueStyle={{ color: "#1677ff" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              dont {kpis.leadsActive} actifs
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Leads créés"
              value={kpis.leadsCreated}
              prefix={<RiseOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>sur la période</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Emails envoyés"
              value={kpis.emailsSent}
              prefix={<MailOutlined />}
              valueStyle={{ color: "#722ed1" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {kpis.campaignsActive} campagne(s) active(s)
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Conversions"
              value={kpis.conversionRate ?? 0}
              suffix="%"
              prefix={<TrophyOutlined />}
              valueStyle={{ color: "#fa8c16" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>taux global</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<Space><MailOutlined /> Performance emailing</Space>}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <Text>Taux d'ouverture</Text>
                <Progress
                  percent={pct(kpis.openRate)}
                  strokeColor="#1677ff"
                  format={() => kpis.openRate != null ? `${kpis.openRate}%` : "—"}
                />
              </div>
              <div>
                <Text>Taux de clic</Text>
                <Progress
                  percent={pct(kpis.clickRate)}
                  strokeColor="#52c41a"
                  format={() => kpis.clickRate != null ? `${kpis.clickRate}%` : "—"}
                />
              </div>
              <div>
                <Text>Taux de réponse</Text>
                <Progress
                  percent={pct(kpis.replyRate)}
                  strokeColor="#fa8c16"
                  format={() => kpis.replyRate != null ? `${kpis.replyRate}%` : "—"}
                />
              </div>
              <div>
                <Text>Taux de bounce</Text>
                <Progress
                  percent={pct(kpis.bounceRate)}
                  strokeColor="#ff4d4f"
                  format={() => kpis.bounceRate != null ? `${kpis.bounceRate}%` : "—"}
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<Space><FireOutlined /> Engagement</Space>}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Statistic
                title="Réponses reçues (inbox)"
                value={kpis.inboxMessagesReceived}
                prefix={<MailOutlined />}
                valueStyle={{ color: "#13c2c2" }}
              />
              <div>
                <Text>Taux de désabonnement</Text>
                <Progress
                  percent={pct(kpis.unsubscribeRate)}
                  strokeColor="#8c8c8c"
                  format={() => kpis.unsubscribeRate != null ? `${kpis.unsubscribeRate}%` : "—"}
                />
              </div>
              <Alert
                type="info"
                showIcon
                message="Indicateurs sur les emails envoyés pendant la période"
                description="Les taux sont calculés sur les envois effectués depuis le début de la période. Les leads totaux et actifs restent des compteurs absolus."
              />
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
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
        <Tag color={v === "DONE" ? "green" : v === "SENDING" ? "blue" : v === "PAUSED" ? "orange" : "default"}>
          {v}
        </Tag>
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
      render: (v) => v != null ? <Tag color={v >= 25 ? "green" : v >= 15 ? "blue" : "default"}>{v}%</Tag> : "—",
    },
    {
      title: "Taux clic", dataIndex: "clickRate", key: "clickRate", width: 100, align: "right",
      render: (v) => v != null ? <Tag color={v >= 3 ? "green" : v >= 1 ? "blue" : "default"}>{v}%</Tag> : "—",
    },
    {
      title: "CTOR", dataIndex: "ctorRate", key: "ctorRate", width: 90, align: "right",
      render: (v) => v != null ? <Text>{v}%</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "Réponses", dataIndex: "replyRate", key: "replyRate", width: 100, align: "right",
      render: (v) => v != null ? <Tag color={v >= 5 ? "green" : "default"}>{v}%</Tag> : "—",
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Total envoyés" value={totals.sent} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Ouvertures" value={totals.openRate ?? 0} suffix="%" valueStyle={{ fontSize: 20, color: "#1677ff" }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Clics" value={totals.clickRate ?? 0} suffix="%" valueStyle={{ fontSize: 20, color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Réponses" value={totals.replyRate ?? 0} suffix="%" valueStyle={{ fontSize: 20, color: "#fa8c16" }} />
          </Card>
        </Col>
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
                data={buckets.map((b) => ({ period: b.period, total: b.total }))}
                xField="period"
                yField="total"
                height={200}
                color="#1677ff"
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

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {rows.length > 0 && (
        <Card title="Volume par commercial">
          <Column
            data={chartData}
            xField="user"
            yField="count"
            colorField="metric"
            group
            height={280}
          />
        </Card>
      )}
      <Table
        rowKey="userId"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="middle"
        scroll={{ x: 1100 }}
        pagination={false}
      />
    </Space>
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
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="Téléchargement instantané"
        description="Choisissez un rapport puis le format. Les exports utilisent la période sélectionnée en haut de page."
      />
      <Row gutter={[16, 16]}>
        {reports.map((r) => (
          <Col key={r.key} xs={24} md={12}>
            <Card>
              <Space align="start" size={16} style={{ width: "100%" }}>
                <div style={{ fontSize: 32, color: "#1677ff" }}>{r.icon}</div>
                <div style={{ flex: 1 }}>
                  <Title level={5} style={{ margin: 0 }}>{r.title}</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.desc}</Text>
                  <div style={{ marginTop: 12 }}>
                    <Space>
                      <Button
                        icon={<DownloadOutlined />}
                        type="primary"
                        onClick={() => doExport(r.key, "xlsx")}
                      >
                        Excel (.xlsx)
                      </Button>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={() => doExport(r.key, "csv")}
                      >
                        CSV
                      </Button>
                    </Space>
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      <Alert
        type="info"
        message="Planification automatique"
        description="L'envoi récurrent des rapports par email (hebdo / mensuel) reste à câbler côté worker. Pour l'instant, lancez l'export à la demande."
      />
    </Space>
  );
}

// ─── Pipeline & potentiel commercial ─────────────────────────────────────────

type PipelineStageMetric = {
  id: string;
  name: string;
  color: string | null;
  count: number;
  totalBusinessPotentialEur: number;
  avgBusinessPotentialEur: number | null;
  conversionRateFromPrevious: number | null;
  avgDaysInStage: number | null;
};

type PipelineAnalytics = {
  totalLeads: number;
  totalBusinessPotentialEur: number;
  winRate: number | null;
  stages: PipelineStageMetric[];
};

function PipelineView() {
  const [data, setData] = useState<PipelineAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data: PipelineAnalytics }>("/analytics/pipeline");
        setData(res.data.data);
      } catch {
        message.error("Impossible de charger les métriques pipeline.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: "center" }}><Spin /></div>;
  if (!data) return <Empty description="Aucune donnée pipeline" />;

  const cols: ColumnsType<PipelineStageMetric> = [
    { title: "Étape", dataIndex: "name", render: (n: string, r) => <Tag color={r.color ?? "blue"}>{n}</Tag> },
    { title: "Leads", dataIndex: "count", width: 80 },
    {
      title: "Potentiel total",
      dataIndex: "totalBusinessPotentialEur",
      render: (v: number) => `${(v ?? 0).toLocaleString("fr-FR")} €`,
    },
    {
      title: "Potentiel moyen",
      dataIndex: "avgBusinessPotentialEur",
      render: (v: number | null) => (v != null ? `${v.toLocaleString("fr-FR")} €` : "—"),
    },
    {
      title: "Conv. étape préc.",
      dataIndex: "conversionRateFromPrevious",
      render: (v: number | null) => (v != null ? `${v}%` : "—"),
    },
    {
      title: "Durée moy.",
      dataIndex: "avgDaysInStage",
      render: (v: number | null) => (v != null ? `${v} j` : "—"),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="Leads en pipeline" value={data.totalLeads} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Potentiel commercial total"
              value={data.totalBusinessPotentialEur}
              suffix="€"
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Taux de conversion"
              value={data.winRate ?? 0}
              suffix="%"
              prefix={<TrophyOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Card title="Détail par colonne du pipeline">
        <Table rowKey="id" columns={cols} dataSource={data.stages} pagination={false} size="small" />
      </Card>
      {data.stages.some((s) => s.totalBusinessPotentialEur > 0) && (
        <Card title="Potentiel par étape">
          <Column
            data={data.stages.map((s) => ({
              stage: s.name,
              potentiel: s.totalBusinessPotentialEur,
            }))}
            xField="stage"
            yField="potentiel"
            color="#fa8c16"
            label={{ position: "top" }}
            height={280}
          />
        </Card>
      )}
    </Space>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [activeTab, setActiveTab] = useState("global");

  return (
    <div style={{ padding: "16px 24px" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Space>
          <BarChartOutlined style={{ fontSize: 24, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>Analytique & Reporting</Title>
        </Space>
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
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        items={[
          {
            key: "global",
            label: <Space><BarChartOutlined /> Vue globale</Space>,
            children: <GlobalView period={period} />,
          },
          {
            key: "campaigns",
            label: <Space><MailOutlined /> Campagnes</Space>,
            children: <CampaignsView />,
          },
          {
            key: "timeline",
            label: <Space><LineChartOutlined /> Évolution leads</Space>,
            children: <TimelineView period={period} />,
          },
          {
            key: "sales",
            label: <Space><UserOutlined /> Performance</Space>,
            children: <SalesView period={period} />,
          },
          {
            key: "pipeline",
            label: <Space><RiseOutlined /> Pipeline</Space>,
            children: <PipelineView />,
          },
          {
            key: "export",
            label: <Space><DownloadOutlined /> Export</Space>,
            children: <ExportView period={period} />,
          },
        ]}
      />
    </div>
  );
}
