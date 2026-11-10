"use client";

/** M-13 — Comparatif des variantes d'un test A/B (page détail d'une campagne). */
import { Alert, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ExperimentOutlined, InfoCircleOutlined, TrophyOutlined } from "@ant-design/icons";
import { palette } from "@/lib/theme";
import { Chip, Panel } from "@/components/ui/Kit";

export type AbVariantStats = {
  variant: "A" | "B";
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
};

export type CampaignAb = {
  splitPercent: number;
  subjects: { A: string | null; B: string | null };
  variants: AbVariantStats[];
  verdict: { winner: "A" | "B" | null; metric: "replyRate" | "openRate" | null; z: number | null; gapPts: number | null; reason: string };
  rules: { minSentPerVariant: number; zThreshold: number; minGapPts: { replyRate: number; openRate: number } };
};

function Cell({ count, rate, color, highlight }: { count: number; rate: number | null; color: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: "right" }}>
      <span className="nb-mono" style={{ fontWeight: 700, color: highlight ? color : "var(--nb-text-strong)" }}>{rate != null ? `${rate} %` : "—"}</span>
      <div style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>{count} contact{count > 1 ? "s" : ""}</div>
    </div>
  );
}

export function AbComparison({ ab }: { ab: CampaignAb }) {
  const { verdict, rules } = ab;
  const win = (v: AbVariantStats, metric: "replyRate" | "openRate") => verdict.winner === v.variant && verdict.metric === metric;

  const columns: ColumnsType<AbVariantStats> = [
    {
      title: "Variante",
      key: "variant",
      render: (_, v) => (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Chip color={v.variant === "A" ? palette.violet : palette.blue}>{v.variant}</Chip>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--nb-text-strong)", fontSize: 13 }}>{ab.subjects[v.variant] ?? "—"}</div>
            <div style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>
              {v.variant === "A" ? ab.splitPercent : 100 - ab.splitPercent} % de l&apos;audience
              {verdict.winner === v.variant && <span style={{ color: palette.green, marginLeft: 8 }}><TrophyOutlined /> gagnante</span>}
            </div>
          </div>
        </div>
      ),
    },
    { title: "Envoyés", dataIndex: "sent", key: "sent", align: "right", width: 90, render: (n: number) => <span className="nb-mono">{n}</span> },
    { title: "Ouvertures", key: "open", align: "right", width: 110, render: (_, v) => <Cell count={v.opens} rate={v.openRate} color={palette.cyan} highlight={win(v, "openRate")} /> },
    { title: "Clics", key: "click", align: "right", width: 100, render: (_, v) => <Cell count={v.clicks} rate={v.clickRate} color={palette.pink} /> },
    { title: "Réponses", key: "reply", align: "right", width: 110, render: (_, v) => <Cell count={v.replies} rate={v.replyRate} color={palette.green} highlight={win(v, "replyRate")} /> },
    { title: "Bounces", dataIndex: "bounces", key: "bounces", align: "right", width: 90, render: (n: number) => <span className="nb-mono">{n}</span> },
  ];

  const rule = `Règle : au moins ${rules.minSentPerVariant} envois par variante ; comparaison du taux de réponse, puis du taux d'ouverture ; `
    + `écart retenu s'il est significatif à 95 % (test z de deux proportions, |z| ≥ ${rules.zThreshold}) et d'au moins `
    + `${rules.minGapPts.replyRate} points (réponse) ou ${rules.minGapPts.openRate} points (ouverture).`;

  return (
    <Panel
      icon={<ExperimentOutlined />}
      title="Test A/B — comparatif des variantes"
      subtitle="Contacts uniques, rattachés à la variante reçue"
      accent={palette.blue}
      extra={<Tooltip title={rule}><InfoCircleOutlined style={{ color: "var(--nb-text-3)" }} aria-label="Règle de la variante gagnante" /></Tooltip>}
    >
      <Alert
        type={verdict.winner ? "success" : "info"}
        showIcon
        icon={verdict.winner ? <TrophyOutlined /> : undefined}
        message={verdict.winner ? `Variante ${verdict.winner} gagnante` : "Pas encore de variante gagnante"}
        description={verdict.reason}
        style={{ marginBottom: 14 }}
      />
      <Table rowKey="variant" columns={columns} dataSource={ab.variants} pagination={false} size="middle" scroll={{ x: 640 }} />
      <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", marginTop: 10 }}>{rule}</div>
    </Panel>
  );
}
