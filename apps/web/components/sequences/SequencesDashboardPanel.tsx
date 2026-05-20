"use client";

/**
 * Tableau de bord des séquences de relance (RL-05).
 *
 * Affiché en tête de la page /sequences :
 *  - 4 cartes KPI globaux (séquences, leads en parcours, emails envoyés, arrêts sur réponse).
 *  - Tableau par séquence : leads actifs/completés/arrêtés, étape moyenne,
 *    nb total envoyés, prochaine action programmée, distribution stoppedReason.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Card, Col, Empty, Progress, Row, Space, Spin, Statistic, Table, Tag, Tooltip,
  Typography, message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ClockCircleOutlined, MailOutlined, PauseCircleOutlined, RetweetOutlined,
  SyncOutlined, TrophyOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Text } = Typography;

type SequenceStat = {
  id: string;
  name: string;
  isPaused: boolean;
  maxSteps: number | null;
  active: number;
  completed: number;
  stopped: number;
  avgCurrentStep: number | null;
  totalSent: number;
  stoppedReasons: Record<string, number>;
  nextScheduledAt: string | null;
};

type Dashboard = {
  totals: {
    sequences: number;
    sequencesActive: number;
    sequencesPaused: number;
    leadsTotal: number;
    leadsActive: number;
    leadsCompleted: number;
    leadsStopped: number;
    emailsSentFromSequences: number;
    repliesStopped: number;
  };
  bySequence: SequenceStat[];
};

const STOPPED_REASON_LABEL: Record<string, string> = {
  reply: "Réponse",
  unsubscribed: "Désinscription",
  hard_bounce: "Hard bounce",
  blacklisted: "Blacklist",
  lead_deleted: "Lead supprimé",
  lead_missing: "Lead introuvable",
};

function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "due maintenant";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `dans ${h} h`;
  const d = Math.floor(h / 24);
  return `dans ${d} j`;
}

export function SequencesDashboardPanel({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Dashboard }>("/sequences/dashboard");
      setData(data.data);
    } catch {
      message.error("Impossible de charger les statistiques des séquences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData, refreshKey]);

  if (loading && !data) {
    return <div style={{ padding: 32, textAlign: "center" }}><Spin /></div>;
  }
  if (!data) return null;

  const t = data.totals;

  const columns: ColumnsType<SequenceStat> = [
    {
      title: "Séquence",
      key: "name",
      fixed: "left",
      render: (_, r) => (
        <Space>
          <Text strong>{r.name}</Text>
          {r.isPaused && <Tag color="orange" icon={<PauseCircleOutlined />}>en pause</Tag>}
          {r.maxSteps && <Tag>max {r.maxSteps} étapes</Tag>}
        </Space>
      ),
    },
    {
      title: "Actifs",
      dataIndex: "active",
      key: "active",
      width: 90,
      align: "right",
      render: (v: number) => <Tag color={v > 0 ? "blue" : "default"}>{v}</Tag>,
    },
    {
      title: "Étape moy.",
      dataIndex: "avgCurrentStep",
      key: "avgCurrentStep",
      width: 110,
      align: "right",
      render: (v: number | null) =>
        v == null ? <Text type="secondary">—</Text> : <Text>{v}</Text>,
    },
    {
      title: "Envoyés",
      dataIndex: "totalSent",
      key: "totalSent",
      width: 100,
      align: "right",
    },
    {
      title: "Complétés",
      dataIndex: "completed",
      key: "completed",
      width: 110,
      align: "right",
      render: (v: number) => v > 0 ? <Tag color="green">{v}</Tag> : <Text type="secondary">0</Text>,
    },
    {
      title: "Arrêtés",
      dataIndex: "stopped",
      key: "stopped",
      width: 100,
      align: "right",
      render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Text type="secondary">0</Text>,
    },
    {
      title: "Raisons d'arrêt",
      dataIndex: "stoppedReasons",
      key: "reasons",
      render: (v: Record<string, number>) => {
        const entries = Object.entries(v);
        if (entries.length === 0) return <Text type="secondary">—</Text>;
        return (
          <Space size={4} wrap>
            {entries.map(([k, n]) => (
              <Tag key={k}>{STOPPED_REASON_LABEL[k] ?? k} ({n})</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "Prochaine action",
      dataIndex: "nextScheduledAt",
      key: "nextScheduledAt",
      width: 160,
      render: (v: string | null) => (
        <Tooltip title={v ? new Date(v).toLocaleString("fr-FR") : ""}>
          <Space size={4}>
            <ClockCircleOutlined style={{ color: v ? "#1677ff" : "#bfbfbf" }} />
            <Text type={v ? undefined : "secondary"} style={{ fontSize: 12 }}>{timeUntil(v)}</Text>
          </Space>
        </Tooltip>
      ),
    },
  ];

  const completionRate = t.leadsTotal > 0
    ? Math.round((t.leadsCompleted / t.leadsTotal) * 1000) / 10
    : null;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Séquences"
              value={t.sequences}
              prefix={<RetweetOutlined />}
              valueStyle={{ fontSize: 22, color: "#1677ff" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t.sequencesActive} actives · {t.sequencesPaused} en pause
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Leads en parcours"
              value={t.leadsActive}
              prefix={<SyncOutlined />}
              valueStyle={{ fontSize: 22, color: "#13c2c2" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t.leadsTotal} total ({t.leadsCompleted} terminés, {t.leadsStopped} arrêtés)
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Emails envoyés"
              value={t.emailsSentFromSequences}
              prefix={<MailOutlined />}
              valueStyle={{ fontSize: 22, color: "#722ed1" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>via les séquences</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Arrêts sur réponse"
              value={t.repliesStopped}
              prefix={<TrophyOutlined />}
              valueStyle={{ fontSize: 22, color: "#52c41a" }}
            />
            {completionRate != null && (
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={completionRate}
                  size="small"
                  format={() => `${completionRate}% complétés`}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {data.bySequence.length === 0 ? (
        <Card>
          <Empty description="Pas encore de séquences créées" />
        </Card>
      ) : (
        <Card title="Performance par séquence" size="small">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data.bySequence}
            pagination={false}
            size="small"
            scroll={{ x: 1000 }}
          />
        </Card>
      )}
    </Space>
  );
}
