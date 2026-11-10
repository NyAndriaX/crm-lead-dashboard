"use client";

/**
 * Section RGPD (SEC-04).
 *
 * - Affiche le registre des activités de traitement (article 30 RGPD).
 * - Permet l'export complet d'un lead (portabilité art. 20).
 * - Permet le droit à l'oubli (purge complète art. 17) avec confirmation
 *   explicite.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, Col, Collapse, Form, Input, message, Modal, Popconfirm,
  Row, Space, Tag, Typography,
} from "antd";
import {
  DeleteOutlined, DownloadOutlined, FileTextOutlined, SafetyCertificateOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type DataProcessing = {
  id: string;
  name: string;
  purpose: string;
  legalBasis: string;
  categories: string[];
  retention: string;
  recipients: string;
  transfer: string;
  security: string;
};

const LEGAL_BASIS_LABEL: Record<string, string> = {
  consent: "Consentement",
  contract: "Exécution d'un contrat",
  legal_obligation: "Obligation légale",
  vital_interests: "Intérêt vital",
  public_interest: "Mission d'intérêt public",
  legitimate_interest: "Intérêt légitime",
};

export function RgpdSection() {
  const [registry, setRegistry] = useState<DataProcessing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState<"export" | "erase" | null>(null);
  const [leadIdForm] = Form.useForm();
  const [working, setWorking] = useState(false);
  const [eraseResult, setEraseResult] = useState<{ leadId: string; removed: Record<string, number | boolean> } | null>(null);

  const fetchRegistry = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: DataProcessing[] }>("/rgpd/registry");
      setRegistry(data.data);
    } catch {
      message.error("Impossible de charger le registre.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRegistry(); }, [fetchRegistry]);

  function openExport() {
    leadIdForm.resetFields();
    setActionOpen("export");
  }
  function openErase() {
    leadIdForm.resetFields();
    setEraseResult(null);
    setActionOpen("erase");
  }

  async function doExport() {
    const { leadId } = await leadIdForm.validateFields();
    // Téléchargement direct via ancre
    const url = `/api/rgpd/leads/${encodeURIComponent(leadId)}/export`;
    const a = document.createElement("a");
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionOpen(null);
    message.success("Export en cours de téléchargement…");
  }

  async function doErase() {
    const { leadId, confirm } = await leadIdForm.validateFields();
    if (confirm !== "EFFACER") {
      message.error("Tapez exactement EFFACER pour confirmer.");
      return;
    }
    setWorking(true);
    try {
      const { data } = await api.post<{ data: { leadId: string; removed: Record<string, number | boolean> } }>(
        `/rgpd/leads/${encodeURIComponent(leadId)}/erase`,
      );
      setEraseResult(data.data);
      message.success("Lead effacé définitivement.");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space align="start" size={16}>
          <SafetyCertificateOutlined style={{ fontSize: 32, color: "#34d399" }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>Conformité RGPD</Title>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              Outils opérationnels pour répondre aux demandes des personnes concernées :
              droit à l'oubli (art. 17), portabilité (art. 20), registre des traitements (art. 30).
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card>
            <Space align="start" size={16}>
              <DownloadOutlined style={{ fontSize: 32, color: "#8b5cf6" }} />
              <div>
                <Title level={5} style={{ marginTop: 0 }}>Export d'un lead (portabilité)</Title>
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Exporte la totalité des données stockées sur un lead (fiche, historique,
                  événements emailing, messages reçus, séquences) au format JSON.
                </Paragraph>
                <Button type="primary" icon={<DownloadOutlined />} onClick={openExport}>
                  Exporter un lead
                </Button>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <Space align="start" size={16}>
              <DeleteOutlined style={{ fontSize: 32, color: "#ff4d4f" }} />
              <div>
                <Title level={5} style={{ marginTop: 0 }}>Droit à l'oubli</Title>
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Supprime définitivement un lead et toutes ses traces (history,
                  events, inbox, séquences). Action irréversible.
                </Paragraph>
                <Button danger icon={<DeleteOutlined />} onClick={openErase}>
                  Effacer un lead
                </Button>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title={<Space><FileTextOutlined /> Registre des activités de traitement (art. 30)</Space>}
        loading={loading}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Liste des traitements de données personnelles actifs dans le CRM.
          À tenir à jour lorsque le périmètre fonctionnel évolue (versionné dans le code).
        </Paragraph>
        <Collapse
          accordion
          items={registry.map((p) => ({
            key: p.id,
            label: (
              <Space>
                <Text strong>{p.name}</Text>
                <Tag color="blue">{LEGAL_BASIS_LABEL[p.legalBasis] ?? p.legalBasis}</Tag>
              </Space>
            ),
            children: (
              <Row gutter={[16, 8]}>
                <Col xs={24} md={12}>
                  <Text strong>Finalité</Text>
                  <Paragraph style={{ marginTop: 4 }}>{p.purpose}</Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>Catégories de données</Text>
                  <ul style={{ marginTop: 4 }}>
                    {p.categories.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>Durée de conservation</Text>
                  <Paragraph style={{ marginTop: 4 }}>{p.retention}</Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>Destinataires</Text>
                  <Paragraph style={{ marginTop: 4 }}>{p.recipients}</Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>Transfert hors UE</Text>
                  <Paragraph style={{ marginTop: 4 }}>{p.transfer}</Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Text strong>Mesures de sécurité</Text>
                  <Paragraph style={{ marginTop: 4 }}>{p.security}</Paragraph>
                </Col>
              </Row>
            ),
          }))}
        />
      </Card>

      {/* Modale export */}
      <Modal
        open={actionOpen === "export"}
        title="Exporter un lead"
        onCancel={() => setActionOpen(null)}
        onOk={() => void doExport()}
        okText="Télécharger"
        cancelText="Annuler"
      >
        <Form form={leadIdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="leadId"
            label="ID du lead"
            rules={[{ required: true, message: "L'ID du lead est requis" }]}
            help="Visible dans l'URL de la fiche lead (/leads/&lt;id&gt;)"
          >
            <Input placeholder="6a059e1f757b9e04134f2416" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modale erase */}
      <Modal
        open={actionOpen === "erase"}
        title={<Space><WarningOutlined style={{ color: "#ff4d4f" }} /> Effacer un lead définitivement</Space>}
        onCancel={() => { setActionOpen(null); setEraseResult(null); }}
        footer={
          eraseResult
            ? <Button onClick={() => { setActionOpen(null); setEraseResult(null); }}>Fermer</Button>
            : null
        }
        destroyOnClose
      >
        {eraseResult ? (
          <Alert
            type="success"
            showIcon
            message="Effacement effectué"
            description={
              <Space direction="vertical" size={4} style={{ marginTop: 8 }}>
                <Text>Lead <Text code>{eraseResult.leadId}</Text> supprimé.</Text>
                <Text>Traces nettoyées :</Text>
                <ul style={{ margin: 0 }}>
                  {Object.entries(eraseResult.removed).map(([k, v]) => (
                    <li key={k}><Text code>{k}</Text> : {String(v)}</li>
                  ))}
                </ul>
              </Space>
            }
          />
        ) : (
          <>
            <Alert
              type="error"
              showIcon
              message="Action irréversible"
              description="Cette opération supprime définitivement le lead, son historique, tous ses messages emailing reçus/envoyés et ses inscriptions de séquences."
              style={{ marginBottom: 16 }}
            />
            <Form form={leadIdForm} layout="vertical">
              <Form.Item
                name="leadId"
                label="ID du lead"
                rules={[{ required: true, message: "ID requis" }]}
              >
                <Input placeholder="6a059e1f757b9e04134f2416" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="Tapez EFFACER en majuscules pour confirmer"
                rules={[{ required: true, message: "Confirmation requise" }]}
              >
                <Input placeholder="EFFACER" />
              </Form.Item>
              <Space>
                <Popconfirm
                  title="Vraiment effacer ce lead ?"
                  description="Action irréversible."
                  okText="Effacer"
                  okButtonProps={{ danger: true }}
                  cancelText="Annuler"
                  onConfirm={() => void doErase()}
                >
                  <Button danger icon={<DeleteOutlined />} loading={working}>
                    Effacer définitivement
                  </Button>
                </Popconfirm>
                <Button onClick={() => setActionOpen(null)}>Annuler</Button>
              </Space>
            </Form>
          </>
        )}
      </Modal>
    </Space>
  );
}
