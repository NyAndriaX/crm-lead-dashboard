"use client";

/**
 * Section Système (Paramètres) — agrège P-03 (santé/monitoring),
 * P-02 (capacité) et T-02 (organisation / multi-tenant).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Card, Space, Typography, Progress, Statistic, Row, Col, Tag, Alert,
  Button, Descriptions, Spin, message,
} from "antd";
import {
  HeartOutlined, DatabaseOutlined, CloudServerOutlined, ReloadOutlined,
  ApartmentOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type Health = {
  status: string;
  version: string;
  uptimeSec: number;
  checks: {
    db?: { status: string; latencyMs: number };
    worker?: { status: string; lastJobAgeMin?: number; note?: string };
  };
};

type Capacity = {
  leads: { used: number; active: number; limit: number; usagePct: number };
  emailsToday: { used: number; targetLimit: number; smtpDailyCapacity: number; usagePct: number; note: string };
  inboxMessages: number;
  sequencesActive: number;
  smtpAccounts: number;
};

type SystemInfo = {
  organization: { id: string; name: string; plan: string; isActive: boolean };
  multiTenant: { enabled: boolean; mode: string; note: string };
};

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}min`;
  return `${Math.floor(sec / 86400)}j ${Math.floor((sec % 86400) / 3600)}h`;
}

export function SystemSection() {
  const [health, setHealth] = useState<Health | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [h, c, i] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        api.get<{ data: Capacity }>("/system/capacity"),
        api.get<{ data: SystemInfo }>("/system/info"),
      ]);
      setHealth(h);
      setCapacity(c.data.data);
      setInfo(i.data.data);
    } catch {
      message.error("Impossible de charger l'état système.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  if (loading) return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>;

  const statusColor = (s?: string) =>
    s === "ok" ? "success" : s === "degraded" || s === "stale" ? "warning" : s === "down" ? "error" : "default";

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* P-03 — Santé / Monitoring */}
      <Card
        size="small"
        title={<Space><HeartOutlined style={{ color: "#ff4d4f" }} /> Santé du service (P-03)</Space>}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => fetchAll()}>Rafraîchir</Button>}
      >
        {health && (
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic
                title="Statut global"
                value={health.status.toUpperCase()}
                valueStyle={{ fontSize: 18 }}
                prefix={<Tag color={statusColor(health.status)} style={{ marginRight: 0 }} />}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Uptime" value={fmtUptime(health.uptimeSec)} valueStyle={{ fontSize: 18 }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={<Space><DatabaseOutlined /> Base de données</Space>}
                value={health.checks.db?.status ?? "?"}
                suffix={health.checks.db ? `${health.checks.db.latencyMs}ms` : ""}
                valueStyle={{ fontSize: 18, color: health.checks.db?.status === "ok" ? "#52c41a" : "#ff4d4f" }}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={<Space><CloudServerOutlined /> Worker</Space>}
                value={health.checks.worker?.status ?? "?"}
                suffix={health.checks.worker?.lastJobAgeMin != null ? `il y a ${health.checks.worker.lastJobAgeMin}min` : ""}
                valueStyle={{
                  fontSize: 18,
                  color: health.checks.worker?.status === "ok" ? "#52c41a" : "#fa8c16",
                }}
              />
            </Col>
          </Row>
        )}
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="Monitoring externe"
          description={
            <>
              Branchez une sonde (Uptime Robot, Better Uptime, Datadog) sur{" "}
              <Text code>GET /api/health</Text> — renvoie 200 si sain, 503 si dégradé.
              Configurez l'alerting (email/Slack) côté sonde. Fenêtre de maintenance
              recommandée : nuit (02:00–04:00).
            </>
          }
        />
      </Card>

      {/* P-02 — Capacité */}
      {capacity && (
        <Card size="small" title={<Space><ThunderboltOutlined style={{ color: "#1677ff" }} /> Capacité (P-02)</Space>}>
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <Text strong>Leads — {capacity.leads.used.toLocaleString("fr-FR")} / {capacity.leads.limit.toLocaleString("fr-FR")}</Text>
              <Progress
                percent={capacity.leads.usagePct}
                status={capacity.leads.usagePct > 90 ? "exception" : "active"}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {capacity.leads.active.toLocaleString("fr-FR")} actifs · cible CDC : 100 000/compte
              </Text>
            </Col>
            <Col xs={24} md={12}>
              <Text strong>Emails aujourd'hui — {capacity.emailsToday.used.toLocaleString("fr-FR")} / {capacity.emailsToday.targetLimit.toLocaleString("fr-FR")}</Text>
              <Progress
                percent={capacity.emailsToday.usagePct}
                status={capacity.emailsToday.usagePct > 90 ? "exception" : "active"}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Capacité SMTP cumulée : {capacity.emailsToday.smtpDailyCapacity.toLocaleString("fr-FR")}/j ({capacity.smtpAccounts} compte(s))
              </Text>
            </Col>
          </Row>
          {capacity.emailsToday.smtpDailyCapacity < capacity.emailsToday.targetLimit && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message={capacity.emailsToday.note}
            />
          )}
          <Descriptions size="small" column={3} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Messages inbox">{capacity.inboxMessages}</Descriptions.Item>
            <Descriptions.Item label="Séquences actives">{capacity.sequencesActive}</Descriptions.Item>
            <Descriptions.Item label="Comptes SMTP">{capacity.smtpAccounts}</Descriptions.Item>
          </Descriptions>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Index Mongo pour la montée en charge : voir <Text code>packages/db/prisma/manual-indexes.md</Text>.
          </Paragraph>
        </Card>
      )}

      {/* T-02 — Organisation / Multi-tenant */}
      {info && (
        <Card size="small" title={<Space><ApartmentOutlined style={{ color: "#722ed1" }} /> Organisation (T-02)</Space>}>
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="Nom">{info.organization.name}</Descriptions.Item>
            <Descriptions.Item label="Plan"><Tag color="purple">{info.organization.plan}</Tag></Descriptions.Item>
            <Descriptions.Item label="Mode">
              <Tag color="blue">{info.multiTenant.mode}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Multi-tenant">
              {info.multiTenant.enabled ? <Tag color="green">activé</Tag> : <Tag>désactivé</Tag>}
            </Descriptions.Item>
          </Descriptions>
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="Mode single-tenant"
            description={info.multiTenant.note}
          />
        </Card>
      )}
    </Space>
  );
}
