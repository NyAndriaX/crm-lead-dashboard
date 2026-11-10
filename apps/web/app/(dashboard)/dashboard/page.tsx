"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Row, Col, Card, Typography, Space, Tag, Table, Alert, Button, Skeleton, Progress } from "antd";
import {
  TeamOutlined, RiseOutlined, FireOutlined, TrophyOutlined, UploadOutlined, CalendarOutlined,
  PieChartOutlined, RadarChartOutlined, ArrowRightOutlined, ThunderboltOutlined, FunnelPlotOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import { palette, statusColors } from "@/lib/theme";
import { useIsMobile } from "@/lib/responsive";
import { StatCard } from "@/components/ui/StatCard";
import { DonutChart, BarChart } from "@/components/ui/Charts";
import { ProspectorRobot } from "@/components/ui/ProspectorRobot";
import { AIBadge } from "@/components/ui/Brand";
import { ActionCenter } from "@/components/dashboard/ActionCenter";

const { Text } = Typography;

interface Kpis {
  total: number; activeLeads: number; newToday: number; thisWeek: number;
  thisMonth: number; monthTrend: number | null; avgScore: number;
  conversionRate: number; converted: number;
}

interface DashStats {
  kpis: Kpis;
  byStatus: Record<string, number>;
  dailyLeads: { date: string; leads: number }[];
  recentLeads: {
    id: string; firstName: string | null; lastName: string | null;
    company: string | null; status: string; score: number;
    source: string | null; createdAt: string;
    assignedTo?: { name: string } | null;
  }[];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function fullName(r: { firstName: string | null; lastName: string | null; company: string | null }) {
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.company || "—";
}

function scoreColor(v: number) {
  return v >= 70 ? palette.green : v >= 40 ? palette.amber : palette.red;
}

function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Space size={10}>
      <span style={{ color: palette.cyan }}>{icon}</span>
      <span className="nb-display" style={{ fontWeight: 600 }}>{children}</span>
    </Space>
  );
}

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

  if (error) return <Alert type="error" message="Impossible de charger le tableau de bord." showIcon />;

  const kpis = stats?.kpis;
  const donut = stats
    ? Object.entries(STATUS_LABELS).map(([key, label]) => ({
        key, label, value: stats.byStatus[key] ?? 0, color: statusColors[key] ?? palette.violet,
      })).filter((d) => d.value > 0)
    : [];
  const bars = (stats?.dailyLeads ?? []).map((d) => ({
    label: new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
    value: d.leads,
  }));

  const cols: ColumnsType<DashStats["recentLeads"][number]> = [
    {
      title: "Lead",
      key: "name",
      render: (_, r) => (
        <Space size={12}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 12, color: "#fff",
              background: `linear-gradient(135deg, ${statusColors[r.status] ?? palette.violet}, ${palette.violet})`,
            }}
          >
            {fullName(r).slice(0, 2).toUpperCase()}
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <Link href={`/leads/${r.id}`} style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{fullName(r)}</Link>
            {r.company && fullName(r) !== r.company && <div style={{ fontSize: 12, color: palette.textTertiary }}>{r.company}</div>}
          </div>
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
      width: 150,
      render: (v: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Progress percent={v} showInfo={false} size="small" strokeColor={scoreColor(v)} style={{ width: 80, margin: 0 }} />
          <span className="nb-mono" style={{ color: scoreColor(v), fontWeight: 600 }}>{v}</span>
        </div>
      ),
    },
    {
      title: "Assigné à",
      key: "assignee",
      responsive: ["md"],
      render: (_, r) => (r.assignedTo ? <Text type="secondary">{r.assignedTo.name}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: "Créé le",
      dataIndex: "createdAt",
      key: "createdAt",
      responsive: ["lg"],
      render: (v: string) => <Text type="secondary">{new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</Text>,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* ── Héros ─────────────────────────────────────────────────────── */}
      <div className="nb-glass nb-gradient-border" style={{ borderRadius: 24, padding: isMobile ? 22 : "28px 34px", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 85% 40%, rgba(139,92,246,0.28), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, position: "relative" }}>
          <div style={{ maxWidth: 640 }}>
            <Space size={10} wrap>
              <span className="nb-eyebrow">
                {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
              <AIBadge>Assistant de prospection</AIBadge>
            </Space>
            <h1 className="nb-display" style={{ margin: "12px 0 8px", fontSize: isMobile ? 28 : 38, fontWeight: 700, lineHeight: 1.1, color: "var(--nb-text-strong)" }}>
              {greeting()}{userName ? ", " : ""}<span className="nb-gradient-text">{userName}</span>
            </h1>
            <div style={{ color: palette.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
              {kpis ? (
                <>
                  <b style={{ color: "var(--nb-text-strong)" }}>{kpis.thisWeek}</b> nouveaux leads cette semaine,{" "}
                  <b style={{ color: "var(--nb-text-strong)" }}>{kpis.activeLeads}</b> en cours de traitement et un taux de conversion de{" "}
                  <b style={{ color: palette.green }}>{kpis.conversionRate} %</b>.
                </>
              ) : (
                "Chargement de votre activité…"
              )}
            </div>
            <Space wrap style={{ marginTop: 22 }}>
              <Link href="/scraping">
                <Button type="primary" size="large" icon={<RadarChartOutlined />}>Lancer une prospection IA</Button>
              </Link>
              <Link href="/import"><Button size="large" icon={<UploadOutlined />}>Importer</Button></Link>
              <Link href="/leads"><Button size="large" type="text" icon={<ArrowRightOutlined />} iconPosition="end">Voir les leads</Button></Link>
            </Space>
          </div>
          {!isMobile && (
            <div style={{ flexShrink: 0, marginRight: 10 }}>
              <ProspectorRobot state="idle" size={170} />
            </div>
          )}
        </div>
      </div>

      <ActionCenter />

      {/* ── KPI ───────────────────────────────────────────────────────── */}
      {loading || !kpis ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3].map((i) => (
            <Col key={i} xs={24} sm={12} xl={6}><Card><Skeleton active paragraph={{ rows: 2 }} /></Card></Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[16, 16]} className="nb-stagger">
          <Col xs={24} sm={12} xl={6}>
            <StatCard label="Total leads" value={kpis.total} icon={<TeamOutlined />} color={palette.violet} hint={`${kpis.activeLeads} actifs`} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard
              label="Nouveaux ce mois" value={kpis.thisMonth} icon={<CalendarOutlined />} color={palette.cyan}
              trend={kpis.monthTrend} spark={(stats?.dailyLeads ?? []).map((d) => d.leads)}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard
              label="Taux de conversion" value={kpis.conversionRate} suffix="%" icon={<TrophyOutlined />} color={palette.green}
              hint={`${kpis.converted} lead${kpis.converted > 1 ? "s" : ""} converti${kpis.converted > 1 ? "s" : ""}`}
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard label="Score moyen" value={kpis.avgScore} suffix="/ 100" icon={<FireOutlined />} color={scoreColor(kpis.avgScore)} hint="Qualité du pipeline" />
          </Col>
        </Row>
      )}

      {/* ── Graphiques ────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={11}>
          <Card title={<CardTitle icon={<PieChartOutlined />}>Répartition par statut</CardTitle>} style={{ height: "100%" }}>
            {loading ? <Skeleton active /> : donut.length > 0 ? <DonutChart data={donut} size={isMobile ? 180 : 210} /> : <Text type="secondary">Aucune donnée</Text>}
          </Card>
        </Col>
        <Col xs={24} lg={13}>
          <Card title={<CardTitle icon={<RiseOutlined />}>Nouveaux leads — 7 derniers jours</CardTitle>} style={{ height: "100%" }}>
            {loading ? <Skeleton active /> : <BarChart data={bars} height={isMobile ? 200 : 250} />}
          </Card>
        </Col>
      </Row>

      {/* ── Leads récents + pipeline ─────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<CardTitle icon={<ThunderboltOutlined />}>Leads récents</CardTitle>}
            extra={<Link href="/leads"><Button type="link" size="small">Voir tous <ArrowRightOutlined /></Button></Link>}
            styles={{ body: { padding: "6px 8px 8px" } }}
          >
            <Table
              size="middle"
              rowKey="id"
              columns={cols}
              dataSource={stats?.recentLeads ?? []}
              loading={loading}
              pagination={false}
              scroll={{ x: 680 }}
              onRow={(r) => ({ onClick: () => window.location.assign(`/leads/${r.id}`), style: { cursor: "pointer" } })}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<CardTitle icon={<FunnelPlotOutlined />}>Entonnoir du pipeline</CardTitle>} style={{ height: "100%" }}>
            {loading || !kpis ? (
              <Skeleton active />
            ) : (
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }} className="nb-stagger">
                {Object.entries(STATUS_LABELS).map(([status, label]) => {
                  const count = stats?.byStatus[status] ?? 0;
                  const pct = kpis.total > 0 ? Math.round((count / kpis.total) * 100) : 0;
                  const c = statusColors[status] ?? palette.violet;
                  return (
                    <div key={status}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                        <span style={{ color: palette.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}` }} />
                          {label}
                        </span>
                        <span className="nb-mono" style={{ color: "var(--nb-text-strong)", fontWeight: 600 }}>
                          {count} <span style={{ color: palette.textTertiary, fontWeight: 400 }}>· {pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 8, background: "rgba(148,163,184,0.08)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${pct}%`, height: "100%", borderRadius: 8,
                            background: `linear-gradient(90deg, ${c}, ${palette.violet})`, boxShadow: `0 0 12px ${c}`,
                            transformOrigin: "left", animation: "nb-grow-x 1s var(--nb-ease) both",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
