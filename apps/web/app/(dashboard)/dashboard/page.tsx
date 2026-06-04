"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Row, Col, Card, Statistic, Typography, Space, Tag, Table, Spin, Alert,
  Button, Avatar, Tooltip, Progress, Badge,
} from "antd";
import {
  TeamOutlined, RiseOutlined, FallOutlined, FireOutlined, TrophyOutlined,
  ArrowUpOutlined, ArrowDownOutlined, PlusOutlined, UploadOutlined,
  UserOutlined, CalendarOutlined, BarChartOutlined,
} from "@ant-design/icons";
import { Pie, Column } from "@ant-design/charts";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import { useIsMobile } from "@/lib/responsive";
import { OpenAiUsageCard, type OpenAiUsageData } from "@/components/dashboard/OpenAiUsageCard";

const { Title, Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Kpis {
  total: number; activeLeads: number; newToday: number; thisWeek: number;
  thisMonth: number; monthTrend: number | null; avgScore: number;
  conversionRate: number; converted: number;
}

interface DashStats {
  kpis: Kpis;
  byStatus: Record<string, number>;
  dailyLeads: { date: string; leads: number }[];
  openAi: OpenAiUsageData | null;
  recentLeads: {
    id: string; firstName: string | null; lastName: string | null;
    company: string | null; status: string; score: number;
    source: string | null; createdAt: string;
    assignedTo?: { name: string } | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_HEX: Record<string, string> = {
  NOUVEAU: "#8c8c8c", CONTACTE: "#1677ff", QUALIFIE: "#13c2c2",
  EN_DISCUSSION: "#faad14", CONVERTI: "#52c41a", PERDU: "#ff4d4f",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function fullName(r: { firstName: string | null; lastName: string | null; company: string | null }) {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.company || "—";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, suffix, icon, color, trend, trendLabel, sub,
}: {
  title: string; value: number | string; suffix?: string; icon: React.ReactNode;
  color: string; trend?: number | null; trendLabel?: string; sub?: string;
}) {
  return (
    <Card
      style={{ borderTop: `3px solid ${color}`, height: "100%" }}
      styles={{ body: { padding: "20px 24px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
            {title}
          </Text>
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
            {suffix && <span style={{ fontSize: 14, color: "#8c8c8c", marginLeft: 4 }}>{suffix}</span>}
          </div>
          {trend != null && (
            <Space size={4} style={{ marginTop: 6 }}>
              {trend >= 0
                ? <ArrowUpOutlined style={{ color: "#52c41a", fontSize: 11 }} />
                : <ArrowDownOutlined style={{ color: "#ff4d4f", fontSize: 11 }} />}
              <Text style={{ fontSize: 12, color: trend >= 0 ? "#52c41a" : "#ff4d4f" }}>
                {Math.abs(trend)}% {trendLabel}
              </Text>
            </Space>
          )}
          {sub && <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>{sub}</Text>}
        </div>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12, background: `${color}18`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, color,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [userName, setUserName] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    api.get<{ user: { name: string } }>("/auth/me")
      .then((r) => setUserName(r.data.user.name.split(" ")[0] ?? r.data.user.name))
      .catch(() => {});

    api.get<{ data: DashStats }>("/dashboard/stats")
      .then((r) => setStats(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400 }}>
      <Spin size="large" tip="Chargement du tableau de bord…" />
    </div>
  );
  if (error) return <Alert type="error" message="Impossible de charger le tableau de bord." showIcon />;
  if (!stats) return null;

  const { kpis, byStatus, dailyLeads, recentLeads, openAi } = stats;

  // Données pour le graphe en secteur (statuts)
  const pieData = Object.entries(byStatus)
    .filter(([, v]) => v > 0)
    .map(([status, value]) => ({
      type: STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status,
      value,
      color: STATUS_HEX[status],
    }));

  // Config Pie
  const pieConfig = {
    data: pieData,
    angleField: "value",
    colorField: "type",
    color: pieData.map((d) => d.color),
    radius: 0.85,
    innerRadius: 0.6,
    label: { type: "spider", content: "{name}: {value}" },
    legend: { position: "bottom" as const },
    statistic: {
      title: { content: "Total" },
      content: { content: String(kpis.total) },
    },
    interactions: [{ type: "element-active" }],
    animation: false,
  };

  // Config Column (évolution 7j)
  const colConfig = {
    data: dailyLeads,
    xField: "date",
    yField: "leads",
    color: "#1677ff",
    columnWidthRatio: 0.6,
    label: { position: "top" as const, style: { fill: "#8c8c8c", fontSize: 11 } },
    xAxis: { label: { autoHide: true, autoRotate: true } },
    yAxis: { nice: true, grid: { line: { style: { stroke: "#f0f0f0" } } } },
    animation: false,
  };

  // Colonnes table leads récents
  const cols: ColumnsType<typeof recentLeads[number]> = [
    {
      title: "Lead",
      key: "name",
      render: (_, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} style={{ background: STATUS_HEX[r.status] }} />
          <Link href={`/leads/${r.id}`} style={{ fontWeight: 500 }}>{fullName(r)}</Link>
        </Space>
      ),
    },
    {
      title: "Statut",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag color={STATUS_COLORS[s as keyof typeof STATUS_COLORS]}>{STATUS_LABELS[s as keyof typeof STATUS_LABELS]}</Tag>,
    },
    {
      title: "Score",
      dataIndex: "score",
      key: "score",
      width: 100,
      render: (v: number) => (
        <Space size={4}>
          <Progress
            type="circle"
            percent={v}
            size={28}
            strokeColor={v >= 70 ? "#52c41a" : v >= 40 ? "#faad14" : "#ff4d4f"}
            format={(p) => <span style={{ fontSize: 9 }}>{p}</span>}
          />
        </Space>
      ),
    },
    {
      title: "Assigné à",
      key: "assignee",
      responsive: ["md"],
      render: (_, r) => r.assignedTo
        ? <Tag icon={<UserOutlined />}>{r.assignedTo.name}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Créé le",
      dataIndex: "createdAt",
      key: "createdAt",
      responsive: ["lg"],
      render: (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>

      {/* ── Bannière de bienvenue ──────────────────────────────────────────── */}
      <div className="page-hero" style={{ background: "linear-gradient(135deg, #1677ff 0%, #0950b3 100%)" }}>
        <div>
          <Title level={isMobile ? 4 : 3} style={{ color: "#fff", margin: 0 }}>
            {greeting()}{userName ? `, ${userName}` : ""} 👋
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 4, display: "block" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </div>
        <div className="page-hero-actions">
          <Link href="/leads">
            <Button icon={<PlusOutlined />} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff" }}>
              Nouveau lead
            </Button>
          </Link>
          <Link href="/import">
            <Button icon={<UploadOutlined />} type="primary" ghost style={{ borderColor: "rgba(255,255,255,0.5)", color: "#fff" }}>
              Importer
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="Total leads"
            value={kpis.total}
            icon={<TeamOutlined />}
            color="#1677ff"
            sub={`${kpis.activeLeads} actifs`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="Nouveaux ce mois"
            value={kpis.thisMonth}
            icon={<CalendarOutlined />}
            color="#13c2c2"
            trend={kpis.monthTrend}
            trendLabel="vs mois dernier"
            sub={`${kpis.newToday} aujourd'hui · ${kpis.thisWeek} cette semaine`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="Taux de conversion"
            value={kpis.conversionRate}
            suffix="%"
            icon={<TrophyOutlined />}
            color="#52c41a"
            sub={`${kpis.converted} lead${kpis.converted > 1 ? "s" : ""} converti${kpis.converted > 1 ? "s" : ""}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            title="Score moyen"
            value={kpis.avgScore}
            suffix="/ 100"
            icon={<FireOutlined />}
            color={kpis.avgScore >= 60 ? "#52c41a" : kpis.avgScore >= 35 ? "#faad14" : "#ff4d4f"}
            sub="Qualité du pipeline"
          />
        </Col>
      </Row>

      {openAi?.configured && (
        <OpenAiUsageCard usage={openAi} />
      )}

      {/* ── Graphiques ────────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <BarChartOutlined style={{ color: "#1677ff" }} />
                <span>Répartition par statut</span>
              </Space>
            }
            style={{ minHeight: isMobile ? 320 : 380 }}
          >
            {pieData.length > 0
              ? <Pie {...pieConfig} height={isMobile ? 220 : 280} />
              : <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 280 }}>
                  <Text type="secondary">Aucune donnée</Text>
                </div>
            }
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#1677ff" }} />
                <span>Nouveaux leads — 7 derniers jours</span>
              </Space>
            }
            style={{ minHeight: isMobile ? 320 : 380 }}
          >
            <Column {...colConfig} height={isMobile ? 220 : 280} />
          </Card>
        </Col>
      </Row>

      {/* ── Derniers leads + Récap statuts ────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <TeamOutlined style={{ color: "#1677ff" }} />
                <span>Leads récents</span>
              </Space>
            }
            extra={<Link href="/leads"><Button type="link" size="small">Voir tous →</Button></Link>}
          >
            <div className="page-table-wrap">
              <Table
                size="small"
                rowKey="id"
                columns={cols}
                dataSource={recentLeads}
                pagination={false}
                scroll={{ x: 720 }}
                onRow={(r) => ({ onClick: () => window.location.assign(`/leads/${r.id}`), style: { cursor: "pointer" } })}
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <FallOutlined style={{ color: "#1677ff" }} />
                <span>Synthèse du pipeline</span>
              </Space>
            }
            style={{ height: "100%" }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {Object.entries(STATUS_LABELS).map(([status, label]) => {
                const count = byStatus[status] ?? 0;
                const pct = kpis.total > 0 ? Math.round((count / kpis.total) * 100) : 0;
                return (
                  <div key={status}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                      <Space size={6}>
                        <Badge color={STATUS_HEX[status]} />
                        <Text style={{ fontSize: 13 }}>{label}</Text>
                      </Space>
                      <Space size={8}>
                        <Text strong style={{ fontSize: 13 }}>{count}</Text>
                        <Text type="secondary" style={{ fontSize: 11, width: 36, textAlign: "right" }}>
                          {pct}%
                        </Text>
                      </Space>
                    </div>
                    <Progress
                      percent={pct}
                      showInfo={false}
                      strokeColor={STATUS_HEX[status]}
                      trailColor="#f5f5f5"
                      size="small"
                    />
                  </div>
                );
              })}
            </Space>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title={<Text style={{ fontSize: 11 }}>Leads actifs</Text>}
                    value={kpis.activeLeads}
                    valueStyle={{ fontSize: 20, color: "#1677ff" }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={<Text style={{ fontSize: 11 }}>Convertis</Text>}
                    value={kpis.converted}
                    valueStyle={{ fontSize: 20, color: "#52c41a" }}
                  />
                </Col>
              </Row>
            </div>
          </Card>
        </Col>
      </Row>

    </Space>
  );
}
