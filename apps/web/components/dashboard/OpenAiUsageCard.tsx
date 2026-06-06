"use client";

import Link from "next/link";
import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { ApiOutlined, SettingOutlined } from "@ant-design/icons";
import { Column } from "@ant-design/charts";
import { openAiFeatureLabel } from "@/lib/openaiUsageLabels";

const { Text, Title } = Typography;

function formatCostUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

export type OpenAiUsageData = {
  enabled: boolean;
  configured: boolean;
  model: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  totalCostUsd: number;
  monthTokens: number;
  monthRequestCount: number;
  monthCostUsd: number;
  last7Days: { date: string; tokens: number }[];
  byFeature: { feature: string; tokens: number; count: number; costUsd: number }[];
  byModel: { model: string; tokens: number; count: number; costUsd: number }[];
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function OpenAiUsageCard({ usage }: { usage: OpenAiUsageData }) {
  if (!usage.configured) return null;

  const colConfig = {
    data: usage.last7Days,
    xField: "date",
    yField: "tokens",
    color: "#722ed1",
    columnWidthRatio: 0.55,
    label: { position: "top" as const, style: { fill: "#8c8c8c", fontSize: 10 } },
    yAxis: { nice: true },
    animation: false,
  };

  return (
    <Card
      title={
        <Space>
          <ApiOutlined style={{ color: "#722ed1" }} />
          <span>Consommation OpenAI</span>
          {usage.model && <Tag color="purple">{usage.model}</Tag>}
          {!usage.enabled && <Tag>IA désactivée</Tag>}
        </Space>
      }
      extra={
        <Link href="/settings?tab=openai">
          <Space size={4}>
            <SettingOutlined />
            <span>Configurer</span>
          </Space>
        </Link>
      }
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Tokens et coût estimé via votre clé API personnelle (emails, briefs, campagnes, etc.).
      </Text>
      <Row gutter={[24, 16]}>
        <Col xs={12} sm={6}>
          <Statistic title="Ce mois" value={formatTokens(usage.monthTokens)} suffix="tokens" />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="Coût ce mois" value={formatCostUsd(usage.monthCostUsd ?? 0)} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="Total cumulé" value={formatTokens(usage.totalTokens)} suffix="tokens" />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title="Coût total" value={formatCostUsd(usage.totalCostUsd ?? 0)} />
        </Col>
      </Row>
      <div style={{ marginTop: 24 }}>
        <Title level={5} style={{ marginBottom: 8 }}>7 derniers jours</Title>
        <Column {...colConfig} height={160} />
      </div>
      {usage.byFeature.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Title level={5} style={{ marginBottom: 8 }}>Répartition ce mois</Title>
          <Table
            size="small"
            pagination={false}
            rowKey="feature"
            dataSource={usage.byFeature}
            columns={[
              {
                title: "Usage",
                dataIndex: "feature",
                render: (f: string) => openAiFeatureLabel(f),
              },
              { title: "Tokens", dataIndex: "tokens", render: (v: number) => formatTokens(v) },
              { title: "Coût", dataIndex: "costUsd", render: (v: number) => formatCostUsd(v ?? 0) },
              { title: "Appels", dataIndex: "count", width: 80 },
            ]}
          />
        </div>
      )}
      {(usage.byModel?.length ?? 0) > 0 && (
        <div style={{ marginTop: 24 }}>
          <Title level={5} style={{ marginBottom: 8 }}>Par modèle ce mois</Title>
          <Table
            size="small"
            pagination={false}
            rowKey="model"
            dataSource={usage.byModel}
            columns={[
              { title: "Modèle", dataIndex: "model", render: (m: string) => <Tag color="purple">{m}</Tag> },
              { title: "Tokens", dataIndex: "tokens", render: (v: number) => formatTokens(v) },
              { title: "Coût", dataIndex: "costUsd", render: (v: number) => formatCostUsd(v ?? 0) },
              { title: "Appels", dataIndex: "count", width: 80 },
            ]}
          />
        </div>
      )}
    </Card>
  );
}
