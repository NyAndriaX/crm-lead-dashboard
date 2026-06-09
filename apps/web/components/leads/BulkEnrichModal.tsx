"use client";

/**
 * Modale d'enrichissement en masse (E-08).
 *
 * Découpe la sélection en lots de 5 et enchaîne les appels à
 * /api/leads/enrich-bulk pour piloter une vraie barre de progression.
 * Le dernier lot porte `final: true` → crée la notification de fin.
 */
import { useEffect, useState } from "react";
import { Modal, Progress, Select, Space, Typography, Button, Alert, Statistic, Row, Col } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";

const { Text, Paragraph } = Typography;

type Provider = "email" | "emailVerify" | "company" | "linkedin" | "news" | "social";

const PROVIDER_LABELS: Record<Provider, string> = {
  email: "Recherche email",
  emailVerify: "Vérification email",
  company: "Firmographie",
  linkedin: "LinkedIn",
  news: "Actualités",
  social: "Réseaux sociaux",
};

const CHUNK = 5;

export function BulkEnrichModal({
  open,
  leadIds,
  onClose,
  onDone,
}: {
  open: boolean;
  leadIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([
    "email", "emailVerify", "company", "linkedin", "news", "social",
  ]);
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (open) {
      setRunning(false);
      setProcessed(0);
      setSucceeded(0);
      setFailed(0);
      setFinished(false);
    }
  }, [open]);

  const total = leadIds.length;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  async function start() {
    setRunning(true);
    setProcessed(0);
    setSucceeded(0);
    setFailed(0);
    setFinished(false);

    const chunks: string[][] = [];
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      chunks.push(leadIds.slice(i, i + CHUNK));
    }

    let okAcc = 0;
    let koAcc = 0;
    for (let i = 0; i < chunks.length; i++) {
      const isFinal = i === chunks.length - 1;
      try {
        const { data } = await api.post<{ data: { succeeded: number; failed: number } }>(
          "/leads/enrich-bulk",
          {
            ids: chunks[i],
            providers,
            final: isFinal,
            totalSelected: total,
          },
        );
        okAcc += data.data.succeeded;
        koAcc += data.data.failed;
      } catch {
        koAcc += chunks[i]!.length;
      }
      setProcessed((p) => p + chunks[i]!.length);
      setSucceeded(okAcc);
      setFailed(koAcc);
    }
    setRunning(false);
    setFinished(true);
    onDone();
  }

  return (
    <Modal
      title={<Space><ThunderboltOutlined style={{ color: "#fa8c16" }} /> Approche — {total} lead(s)</Space>}
      open={open}
      onCancel={running ? undefined : onClose}
      maskClosable={!running}
      closable={!running}
      footer={
        finished
          ? [<Button key="close" type="primary" onClick={onClose}>Fermer</Button>]
          : [
              <Button key="cancel" onClick={onClose} disabled={running}>Annuler</Button>,
              <Button
                key="start"
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={running}
                disabled={providers.length === 0}
                onClick={() => void start()}
              >
                Lancer l&apos;approche
              </Button>,
            ]
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Traitement par lots de {CHUNK}. Les providers sans clé API utilisent des
          heuristiques gratuites (patterns + DNS MX + Google News).
        </Paragraph>

        <Select<Provider[]>
          mode="multiple"
          style={{ width: "100%" }}
          value={providers}
          onChange={setProviders}
          disabled={running || finished}
          options={(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => ({
            value: p,
            label: PROVIDER_LABELS[p],
          }))}
        />

        {(running || finished) && (
          <>
            <Progress
              percent={percent}
              status={finished ? "success" : "active"}
            />
            <Row gutter={16}>
              <Col span={8}><Statistic title="Traités" value={processed} suffix={`/ ${total}`} /></Col>
              <Col span={8}><Statistic title="Réussis" value={succeeded} valueStyle={{ color: "#52c41a" }} /></Col>
              <Col span={8}><Statistic title="Échecs" value={failed} valueStyle={{ color: failed > 0 ? "#ff4d4f" : undefined }} /></Col>
            </Row>
          </>
        )}

        {finished && (
          <Alert
            type={failed === 0 ? "success" : "warning"}
            showIcon
            message="Approche terminée"
            description={`${succeeded} lead(s) enrichi(s)${failed > 0 ? `, ${failed} échec(s)` : ""}. Une notification a été créée.`}
          />
        )}
      </Space>
    </Modal>
  );
}
