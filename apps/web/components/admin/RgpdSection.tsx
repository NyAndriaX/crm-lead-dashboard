"use client";

/**
 * Section RGPD (SEC-04).
 *
 * - Affiche le registre des activités de traitement (article 30 RGPD).
 * - Permet l'export complet d'un lead (portabilité art. 20).
 * - Permet le droit à l'oubli (purge complète art. 17) avec confirmation
 *   explicite.
 * - Deux niveaux de suppression :
 *   1. Leads archivés (soft delete) — consultables et réintégrables.
 *   2. Suppressions RGPD — blacklist permanente, réintégration interdite.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Form, Input, Modal, Popconfirm, Row, Space, Table, Tabs, Tag, Typography } from "antd";
import {
  DeleteOutlined, DownloadOutlined, FileTextOutlined, RollbackOutlined,
  SafetyCertificateOutlined, StopOutlined, WarningOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

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

type ArchivedLead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  source: string | null;
  status: string;
  deletedAt: string;
  createdAt: string;
};

type GdprErased = {
  id: string;
  emailHashPrefix: string;
  reason: string | null;
  erasedBy: string | null;
  erasedByName: string | null;
  createdAt: string;
};

const LEGAL_BASIS_LABEL: Record<string, string> = {
  consent: "Consentement",
  contract: "Exécution d'un contrat",
  legal_obligation: "Obligation légale",
  vital_interests: "Intérêt vital",
  public_interest: "Mission d'intérêt public",
  legitimate_interest: "Intérêt légitime",
};

function formatName(row: ArchivedLead): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return row.company ?? "—";
}

export function RgpdSection() {
  const [registry, setRegistry] = useState<DataProcessing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState<"export" | "erase" | null>(null);
  const [leadIdForm] = Form.useForm();
  const [working, setWorking] = useState(false);
  const [eraseResult, setEraseResult] = useState<{ leadId: string; removed: Record<string, number | boolean> } | null>(null);

  const [archived, setArchived] = useState<ArchivedLead[]>([]);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [erased, setErased] = useState<GdprErased[]>([]);
  const [erasedTotal, setErasedTotal] = useState(0);
  const [erasedPage, setErasedPage] = useState(1);
  const [erasedLoading, setErasedLoading] = useState(false);

  const fetchRegistry = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: DataProcessing[] }>("/rgpd/registry");
      setRegistry(data.data);
    } catch (e) { notifyApiError(e, "Impossible de charger le registre."); } finally {
      setLoading(false);
    }
  }, []);

  const fetchArchived = useCallback(async (page = 1) => {
    setArchivedLoading(true);
    try {
      const { data } = await api.get<{ data: ArchivedLead[]; total: number; page: number }>(
        "/rgpd/archived-leads",
        { params: { page, pageSize: 15 } },
      );
      setArchived(data.data);
      setArchivedTotal(data.total);
      setArchivedPage(data.page);
    } catch (e) { notifyApiError(e, "Impossible de charger les leads archivés."); } finally {
      setArchivedLoading(false);
    }
  }, []);

  const fetchErased = useCallback(async (page = 1) => {
    setErasedLoading(true);
    try {
      const { data } = await api.get<{ data: GdprErased[]; total: number; page: number }>(
        "/rgpd/erased-contacts",
        { params: { page, pageSize: 15 } },
      );
      setErased(data.data);
      setErasedTotal(data.total);
      setErasedPage(data.page);
    } catch (e) { notifyApiError(e, "Impossible de charger les suppressions RGPD."); } finally {
      setErasedLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRegistry(); }, [fetchRegistry]);
  useEffect(() => { void fetchArchived(1); void fetchErased(1); }, [fetchArchived, fetchErased]);

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
    const url = `/api/rgpd/leads/${encodeURIComponent(leadId)}/export`;
    const a = document.createElement("a");
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionOpen(null);
    notifySuccess("Export en cours de téléchargement…");
  }

  async function doErase() {
    const { leadId, confirm } = await leadIdForm.validateFields();
    if (confirm !== "EFFACER") {
      notifyError("Tapez exactement EFFACER pour confirmer.");
      return;
    }
    setWorking(true);
    try {
      const { data } = await api.post<{ data: { leadId: string; removed: Record<string, number | boolean> } }>(
        `/rgpd/leads/${encodeURIComponent(leadId)}/erase`,
      );
      setEraseResult(data.data);
      notifySuccess("Lead effacé définitivement — email bloqué pour toute réintégration.");
      void fetchErased(1);
      void fetchArchived(archivedPage);
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setWorking(false);
    }
  }

  async function restoreArchived(id: string) {
    setRestoringId(id);
    try {
      await api.post(`/leads/${encodeURIComponent(id)}/restore`);
      notifySuccess("Lead réintégré dans le CRM.");
      void fetchArchived(archivedPage);
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setRestoringId(null);
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space align="start" size={16}>
          <SafetyCertificateOutlined style={{ fontSize: 32, color: "#52c41a" }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>Conformité RGPD</Title>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              Outils opérationnels pour répondre aux demandes des personnes concernées :
              droit à l'oubli (art. 17), portabilité (art. 20), registre des traitements (art. 30).
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Card title="Leads supprimés">
        <Tabs
          items={[
            {
              key: "archived",
              label: (
                <Space>
                  <RollbackOutlined />
                  Archivés (réintégrables)
                </Space>
              ),
              children: (
                <>
                  <Paragraph type="secondary" style={{ marginTop: 0 }}>
                    Leads mis à la corbeille (soft delete). Vous pouvez les retrouver ici et les
                    réintégrer dans le CRM. Ils restent exclus des campagnes tant qu'ils sont archivés.
                  </Paragraph>
                  <Table<ArchivedLead>
                    rowKey="id"
                    size="small"
                    loading={archivedLoading}
                    dataSource={archived}
                    pagination={{
                      current: archivedPage,
                      pageSize: 15,
                      total: archivedTotal,
                      showTotal: (t) => `${t} lead(s) archivé(s)`,
                      onChange: (p) => void fetchArchived(p),
                    }}
                    columns={[
                      {
                        title: "Contact",
                        key: "name",
                        render: (_, r) => (
                          <Space direction="vertical" size={0}>
                            <Text strong>{formatName(r)}</Text>
                            {r.email && <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>}
                          </Space>
                        ),
                      },
                      { title: "Statut", dataIndex: "status", width: 120, render: (s) => <Tag>{s}</Tag> },
                      { title: "Source", dataIndex: "source", width: 120, render: (v) => v ?? "—" },
                      {
                        title: "Archivé le",
                        dataIndex: "deletedAt",
                        width: 160,
                        render: (v: string) => new Date(v).toLocaleString("fr-FR"),
                      },
                      {
                        title: "Actions",
                        key: "actions",
                        width: 140,
                        render: (_, r) => (
                          <Space>
                            <Popconfirm
                              title="Réintégrer ce lead ?"
                              description="Le lead redeviendra visible et contactable dans le CRM."
                              okText="Réintégrer"
                              cancelText="Annuler"
                              onConfirm={() => void restoreArchived(r.id)}
                            >
                              <Button
                                type="link"
                                size="small"
                                icon={<RollbackOutlined />}
                                loading={restoringId === r.id}
                              >
                                Réintégrer
                              </Button>
                            </Popconfirm>
                            <Popconfirm
                              title="Passer en suppression RGPD ?"
                              description="Le lead sera effacé définitivement et son email bloqué pour toute réintégration."
                              okText="Supprimer RGPD"
                              okButtonProps={{ danger: true }}
                              cancelText="Annuler"
                              onConfirm={async () => {
                                try {
                                  await api.post(`/rgpd/archived-leads/${encodeURIComponent(r.id)}/erase`);
                                  notifySuccess("Lead passé en suppression RGPD.");
                                  void fetchArchived(archivedPage);
                                  void fetchErased(1);
                                } catch (e) { notifyApiError(e, "Erreur"); }
                              }}
                            >
                              <Button type="link" size="small" danger icon={<StopOutlined />}>
                                RGPD
                              </Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: "erased",
              label: (
                <Space>
                  <StopOutlined />
                  Suppressions RGPD (bloquées)
                </Space>
              ),
              children: (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    message="Blocage permanent"
                    description="Ces adresses ont fait l'objet d'un droit à l'oubli. Toute tentative de création manuelle, import CSV ou scraping sera refusée. Les campagnes et séquences ne pourront pas les contacter."
                    style={{ marginBottom: 16 }}
                  />
                  <Table<GdprErased>
                    rowKey="id"
                    size="small"
                    loading={erasedLoading}
                    dataSource={erased}
                    pagination={{
                      current: erasedPage,
                      pageSize: 15,
                      total: erasedTotal,
                      showTotal: (t) => `${t} contact(s) bloqué(s)`,
                      onChange: (p) => void fetchErased(p),
                    }}
                    columns={[
                      {
                        title: "Empreinte email",
                        dataIndex: "emailHashPrefix",
                        render: (v) => <Text code>{v}</Text>,
                      },
                      {
                        title: "Supprimé le",
                        dataIndex: "createdAt",
                        width: 160,
                        render: (v: string) => new Date(v).toLocaleString("fr-FR"),
                      },
                      {
                        title: "Par",
                        key: "by",
                        width: 140,
                        render: (_, r) => r.erasedByName ?? (r.erasedBy ? <Text code>{r.erasedBy.slice(0, 8)}…</Text> : "—"),
                      },
                      {
                        title: "Statut",
                        key: "status",
                        width: 120,
                        render: () => <Tag color="red">Bloqué RGPD</Tag>,
                      },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card>
            <Space align="start" size={16}>
              <DownloadOutlined style={{ fontSize: 32, color: "#1677ff" }} />
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
                  Supprime définitivement un lead et toutes ses traces, puis bloque son email
                  pour empêcher toute réintégration ou contact futur. Action irréversible.
                </Paragraph>
                <Button danger icon={<DeleteOutlined />} onClick={openErase}>
                  Effacer un lead (RGPD)
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
                <Text>Lead <Text code>{eraseResult.leadId}</Text> supprimé et email ajouté à la liste de blocage RGPD.</Text>
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
              description="Cette opération supprime définitivement le lead, son historique, tous ses messages emailing reçus/envoyés et ses inscriptions de séquences. L'adresse email sera bloquée : aucune réintégration manuelle, import ou scraping ne sera possible."
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
                  description="Action irréversible — email bloqué définitivement."
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
