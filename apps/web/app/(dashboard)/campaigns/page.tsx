"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  MailOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RocketOutlined,
  TeamOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/client";
import { useIsMobile } from "@/lib/responsive";

const { Title, Text, Paragraph } = Typography;

type TemplateOpt = { id: string; name: string; subject: string };
type SmtpOpt = { id: string; label: string; fromEmail?: string | null };
type SegmentRow = { id: string; name: string; filters: unknown; createdAt: string };
type CampaignRow = {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  scheduledAt: string | null;
  dailyLimit: number | null;
  stats: unknown;
  config: unknown;
  template: TemplateOpt | null;
  segment: { id: string; name: string } | null;
  smtpConfig: SmtpOpt | null;
};

const STATUS_COL: Record<string, string> = {
  DRAFT: "default",
  SCHEDULED: "processing",
  SENDING: "processing",
  PAUSED: "warning",
  DONE: "success",
  CANCELLED: "error",
};

export default function CampaignsPage() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [smtps, setSmtps] = useState<SmtpOpt[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsCamp, setStatsCamp] = useState<CampaignRow | null>(null);
  const [stats, setStats] = useState<{ sent: number; opens: number; clicks: number; bounces: number; unsubscribes: number } | null>(null);

  const [campModal, setCampModal] = useState(false);
  const [segModal, setSegModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignRow | null>(null);
  const [editingSegment, setEditingSegment] = useState<SegmentRow | null>(null);
  const [campaignDetailOpen, setCampaignDetailOpen] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<CampaignRow | null>(null);
  const [segmentDetailOpen, setSegmentDetailOpen] = useState(false);
  const [detailSegment, setDetailSegment] = useState<SegmentRow | null>(null);
  const [campModalMessage, setCampModalMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [segModalMessage, setSegModalMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [campaignQuery, setCampaignQuery] = useState("");
  const [segmentQuery, setSegmentQuery] = useState("");
  const [campForm] = Form.useForm();
  const [segForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, tpl, sm, seg] = await Promise.all([
        api.get<{ data: CampaignRow[] }>("/campaigns"),
        api.get<{ data: { id: string; name: string; subject: string }[] }>("/templates"),
        api.get<{ data: SmtpOpt[] }>("/smtp-configs"),
        api.get<{ data: SegmentRow[] }>("/segments"),
      ]);
      setCampaigns(c.data.data);
      setTemplates(tpl.data.data.map((t) => ({ id: t.id, name: t.name, subject: t.subject })));
      setSmtps(sm.data.data);
      setSegments(seg.data.data);
    } catch {
      message.error("Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openStats = async (row: CampaignRow) => {
    setStatsCamp(row);
    setStatsOpen(true);
    setStats(null);
    try {
      const { data } = await api.get<{ data: typeof stats }>(`/campaigns/${row.id}/stats`);
      setStats(data.data);
    } catch {
      message.error("Stats indisponibles");
    }
  };

  const saveCampaign = async () => {
    try {
      const v = await campForm.validateFields();
      const config = {
        throttleMinDelayMs: v.throttleMinDelayMs,
        bodyHtmlOverride: v.bodyHtmlOverride || undefined,
        aiPersonalize: Boolean(v.aiPersonalize),
        ab:
          v.abEnabled
            ? {
                enabled: true,
                subjectB: v.abSubjectB || undefined,
                bodyHtmlB: v.abBodyHtmlB || undefined,
                splitPercent: v.abSplitPercent,
              }
            : undefined,
        warmup:
          v.warmupEnabled
            ? {
                enabled: true,
                startPerDay: v.warmupStart,
                growth: v.warmupGrowth,
              }
            : undefined,
      };
      const payload = {
        name: v.name,
        templateId: v.templateId,
        segmentId: v.segmentId,
        smtpConfigId: v.smtpConfigId,
        subject: v.subject,
        scheduledAt: v.scheduledAt ? v.scheduledAt.toDate() : null,
        dailyLimit: v.dailyLimit ?? null,
        config,
      };
      if (editingCampaign) {
        await api.put(`/campaigns/${editingCampaign.id}`, payload);
        const successMessage = "Campagne mise à jour";
        setCampModalMessage({ type: "success", message: successMessage });
        message.success(successMessage);
      } else {
        await api.post("/campaigns", payload);
        message.success("Campagne créée");
        setCampModal(false);
        setEditingCampaign(null);
        campForm.resetFields();
      }
      void load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error(editingCampaign ? "Mise à jour impossible" : "Création impossible");
    }
  };

  const saveSegment = async () => {
    try {
      const v = await segForm.validateFields();
      const filters: Record<string, unknown> = {};
      if (v.fStatus) filters.status = v.fStatus;
      if (v.fTag) filters.tag = v.fTag;
      if (v.fSector) filters.sector = v.fSector;
      if (v.fScoreMin != null) filters.scoreMin = v.fScoreMin;
      if (v.fScoreMax != null) filters.scoreMax = v.fScoreMax;
      const payload = { name: v.name, filters };
      if (editingSegment) {
        await api.put(`/segments/${editingSegment.id}`, payload);
        message.success("Segment mis à jour");
      } else {
        await api.post("/segments", payload);
        message.success("Segment créé");
      }
      if (editingSegment) {
        const successMessage = "Segment mis à jour";
        setSegModalMessage({ type: "success", message: successMessage });
        message.success(successMessage);
      } else {
        setSegModal(false);
        setEditingSegment(null);
        segForm.resetFields();
        message.success("Segment créé");
      }
      void load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error(editingSegment ? "Mise à jour impossible" : "Segment impossible");
    }
  };

  const schedule = async (id: string) => {
    try {
      await api.post(`/campaigns/${id}/schedule`, {});
      message.success("Campagne planifiée — le worker enverra les messages.");
      void load();
    } catch {
      message.error("Planification refusée");
    }
  };

  const destroyCampaign = async (id: string) => {
    try {
      await api.delete(`/campaigns/${id}`);
      message.success("Campagne supprimée");
      void load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Suppression impossible";
      message.error(msg);
    }
  };

  const deleteSegment = async (id: string) => {
    try {
      await api.delete(`/segments/${id}`);
      message.success("Segment supprimé");
      void load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Suppression impossible";
      message.error(msg);
    }
  };

  const openEditCampaign = async (row: CampaignRow) => {
    try {
      const { data } = await api.get<{ data: CampaignRow }>(`/campaigns/${row.id}`);
      const campaign = data.data;
      setEditingCampaign(campaign);
      setCampModalMessage(null);
      setCampModal(true);
      const config = (campaign.config ?? {}) as Record<string, unknown>;
      const ab = (config.ab ?? {}) as Record<string, unknown>;
      const warmup = (config.warmup ?? {}) as Record<string, unknown>;
      campForm.setFieldsValue({
        name: campaign.name,
        templateId: campaign.template?.id,
        segmentId: campaign.segment?.id,
        smtpConfigId: campaign.smtpConfig?.id,
        subject: campaign.subject ?? undefined,
        scheduledAt: campaign.scheduledAt ? dayjs(campaign.scheduledAt) : null,
        dailyLimit: campaign.dailyLimit ?? null,
        abEnabled: Boolean(ab.enabled),
        aiPersonalize: Boolean(config.aiPersonalize),
        throttleMinDelayMs: (config.throttleMinDelayMs as number) ?? undefined,
        warmupEnabled: Boolean(warmup.enabled),
        warmupStart: (warmup.startPerDay as number) ?? undefined,
        warmupGrowth: (warmup.growth as number) ?? undefined,
        abSubjectB: (ab.subjectB as string) ?? undefined,
        abBodyHtmlB: (ab.bodyHtmlB as string) ?? undefined,
        abSplitPercent: (ab.splitPercent as number) ?? 50,
        bodyHtmlOverride: (config.bodyHtmlOverride as string) ?? undefined,
      });
    } catch {
      message.error("Impossible de charger la campagne");
    }
  };

  const openEditSegment = async (row: SegmentRow) => {
    setEditingSegment(row);
    setSegModalMessage(null);
    setSegModal(true);
    const filters = row.filters as Record<string, unknown>;
    segForm.setFieldsValue({
      name: row.name,
      fStatus: filters.status ?? undefined,
      fTag: filters.tag ?? undefined,
      fSector: filters.sector ?? undefined,
      fScoreMin: filters.scoreMin ?? undefined,
      fScoreMax: filters.scoreMax ?? undefined,
    });
  };

  const openCampaignDetails = (row: CampaignRow) => {
    setDetailCampaign(row);
    setCampaignDetailOpen(true);
  };

  const openSegmentDetails = (row: SegmentRow) => {
    setDetailSegment(row);
    setSegmentDetailOpen(true);
  };

  const closeDetails = () => {
    setCampaignDetailOpen(false);
    setSegmentDetailOpen(false);
    setDetailCampaign(null);
    setDetailSegment(null);
  };

  const pause = async (id: string) => {
    try {
      await api.post(`/campaigns/${id}/pause`, {});
      message.success("Campagne en pause");
      void load();
    } catch {
      message.error("Pause impossible");
    }
  };

  const resume = async (id: string) => {
    try {
      await api.post(`/campaigns/${id}/resume`, {});
      message.success("Reprise demandée");
      void load();
    } catch {
      message.error("Reprise impossible");
    }
  };

  const filteredCampaigns = useMemo(
    () => {
      const query = campaignQuery.trim().toLowerCase();
      if (!query) return campaigns;
      return campaigns.filter((row) => {
        const values = [row.name, row.template?.name, row.segment?.name, row.status, row.subject ?? ""].join(" ").toLowerCase();
        return values.includes(query);
      });
    },
    [campaignQuery, campaigns],
  );

  const filteredSegments = useMemo(
    () => {
      const query = segmentQuery.trim().toLowerCase();
      if (!query) return segments;
      return segments.filter((row) => row.name.toLowerCase().includes(query));
    },
    [segmentQuery, segments],
  );

  const canEditCampaign = (status: string) => ["DRAFT", "SCHEDULED", "PAUSED"].includes(status);
  const canDeleteCampaign = (status: string) => ["DRAFT", "CANCELLED", "DONE", "PAUSED"].includes(status);
  const editingCampaignNotEditable = Boolean(editingCampaign && !canEditCampaign(editingCampaign.status));

  // Colonnes stables ; dépend uniquement de `isMobile` (handlers exclus volontairement).
  const cols: ColumnsType<CampaignRow> = useMemo(
    () => [
      { title: "Nom", dataIndex: "name", key: "name", ellipsis: true },
      {
        title: "Statut",
        dataIndex: "status",
        key: "status",
        width: 120,
        render: (s: string) => <Tag color={STATUS_COL[s] ?? "default"}>{s}</Tag>,
      },
      { title: "Template", key: "tpl", ellipsis: true, render: (_, r) => r.template?.name ?? "—" },
      { title: "Segment", key: "seg", ellipsis: true, render: (_, r) => r.segment?.name ?? "—" },
      {
        title: "Actions",
        key: "a",
        width: isMobile ? 140 : 380,
        render: (_, r) => (
          <Space wrap size={4}>
            <Button size="small" onClick={(e) => { e.stopPropagation(); void openStats(r); }} icon={<BarChartOutlined />}>
              Stats
            </Button>
            {canEditCampaign(r.status) ? (
              <Button size="small" onClick={(e) => { e.stopPropagation(); void openEditCampaign(r); }}>
                Modifier
              </Button>
            ) : (
              <Tooltip title="Campagne non modifiable dans cet état">
                <Button size="small" disabled>
                  Modifier
                </Button>
              </Tooltip>
            )}
            {r.status === "DRAFT" || r.status === "PAUSED" ? (
              <Button size="small" type="primary" icon={<RocketOutlined />} onClick={(e) => { e.stopPropagation(); return r.status === "PAUSED" ? void resume(r.id) : void schedule(r.id); }}>
                {r.status === "PAUSED" ? "Relancer" : "Lancer"}
              </Button>
            ) : null}
            {r.status === "SCHEDULED" || r.status === "SENDING" ? (
              <Button size="small" icon={<PauseCircleOutlined />} onClick={(e) => { e.stopPropagation(); void pause(r.id); }}>
                Pause
              </Button>
            ) : null}
            {canDeleteCampaign(r.status) ? (
              <Popconfirm
                title={`Supprimer la campagne « ${r.name} » ?`}
                description={r.status === "DONE" ? "L'historique d'envoi et les statistiques seront définitivement effacés." : undefined}
                onConfirm={(e) => { e?.stopPropagation(); void destroyCampaign(r.id); }}
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger onClick={(e) => e.stopPropagation()}>
                  Supprimer
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Mettez la campagne en pause ou annulez-la avant de la supprimer">
                <Button size="small" danger disabled>
                  Supprimer
                </Button>
              </Tooltip>
            )}
          </Space>
        ),
      },
    ],
    // Handlers (schedule, pause, resume, openStats) volontairement exclus pour limiter les re-rendus du tableau.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colonnes stables, `isMobile` seul suffit
    [isMobile],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          <MailOutlined /> Campagnes emailing
        </Title>
        <Text type="secondary">
          Créez des segments sur vos leads, planifiez des campagnes avec envoi régulé, suivez ouvertures et clics,
          gérez les bounces et les désabonnements (RFC 8058), et affinez la délivrabilité avec montée en charge et tests A/B.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Worker requis pour l’envoi"
        description="Assurez-vous que `apps/worker` tourne avec les mêmes variables `DATABASE_URL`, `PII_ENCRYPTION_KEY`, `EMAIL_HASH_SECRET`, `APP_BASE_URL` que l’app web."
      />

      <Card
        title={<Space><TeamOutlined />Segments ciblés</Space>}
        extra={
          <Space>
            <Input.Search
              placeholder="Rechercher un segment"
              allowClear
              onSearch={setSegmentQuery}
              onChange={(e) => setSegmentQuery(e.target.value)}
              style={{ width: 240 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSegModal(true); setEditingSegment(null); }}>
              Nouveau segment
            </Button>
          </Space>
        }
      >
        <Table<SegmentRow>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filteredSegments}
          pagination={{ pageSize: 6 }}
          onRow={(record) => ({ onClick: () => openSegmentDetails(record) })}
          columns={[
            { title: "Nom", dataIndex: "name", key: "name" },
            { title: "Créé", dataIndex: "createdAt", key: "c", render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm") },
            {
              title: "Actions",
              key: "actions",
              width: 180,
              render: (_, row) => (
                <Space wrap>
                        <Button size="small" onClick={(e) => { e.stopPropagation(); void openEditSegment(row); }}>
                    Modifier
                  </Button>
                  <Popconfirm
                    title={`Supprimer le segment « ${row.name} » ?`}
                    description="Les campagnes terminées qui l'utilisent seront conservées sans segment."
                    onConfirm={(e) => { e?.stopPropagation(); void deleteSegment(row.id); }}
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger onClick={(e) => e.stopPropagation()}>
                      Supprimer
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card
        title={<Space><PlayCircleOutlined />Campagnes</Space>}
        extra={
          <Space>
            <Input.Search
              placeholder="Rechercher une campagne"
              allowClear
              onSearch={setCampaignQuery}
              onChange={(e) => setCampaignQuery(e.target.value)}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCampModal(true); setEditingCampaign(null); }}>
              Nouvelle campagne
            </Button>
          </Space>
        }
      >
        <Table<CampaignRow>
          rowKey="id"
          loading={loading}
          columns={cols}
          dataSource={filteredCampaigns}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 8 }}
          onRow={(record) => ({
            onClick: () => openCampaignDetails(record),
          })}
        />
      </Card>

      <Modal
        title={editingSegment ? "Modifier le segment" : "Nouveau segment"}
        open={segModal}
        onOk={() => void saveSegment()}
        onCancel={() => { setSegModal(false); setEditingSegment(null); setSegModalMessage(null); segForm.resetFields(); }}
        width={520}
        okText={editingSegment ? "Enregistrer" : "Créer"}
      >
        <Form form={segForm} layout="vertical">
          {segModalMessage ? (
            <Alert type={segModalMessage.type} message={segModalMessage.message} showIcon style={{ marginBottom: 16 }} />
          ) : null}
          <Form.Item name="name" label="Nom" rules={[{ required: true }]}>
            <Input placeholder="Ex: Prospects IT France" />
          </Form.Item>
          <Text type="secondary">Filtres (aperçu côté API / worker — même logique que la liste Leads)</Text>
          <Row gutter={8} style={{ marginTop: 8 }}>
            <Col span={12}>
              <Form.Item name="fStatus" label="Statut">
                <Select allowClear placeholder="Tous" options={["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"].map((s) => ({ label: s, value: s }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fTag" label="Tag">
                <Input placeholder="ex: vip" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fSector" label="Secteur">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fScoreMin" label="Score min">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fScoreMax" label="Score max">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={editingCampaign ? "Modifier la campagne" : "Nouvelle campagne"}
        open={campModal}
        onOk={() => void saveCampaign()}
        onCancel={() => { setCampModal(false); setEditingCampaign(null); setCampModalMessage(null); campForm.resetFields(); }}
        width={720}
        okText={editingCampaign ? "Enregistrer" : "Créer"}
        okButtonProps={{ disabled: editingCampaignNotEditable }}
      >
        <Form form={campForm} layout="vertical" initialValues={{ abSplitPercent: 50, throttleMinDelayMs: 12000, warmupStart: 40, warmupGrowth: 1.15 }}>
          {campModalMessage ? (
            <Alert type={campModalMessage.type} message={campModalMessage.message} showIcon style={{ marginBottom: 16 }} />
          ) : null}
          {editingCampaignNotEditable ? (
            <Alert
              type="warning"
              message="Cette campagne ne peut pas être modifiée dans son état actuel."
              showIcon
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Form.Item name="name" label="Nom" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="templateId" label="Template" rules={[{ required: true }]}>
                <Select options={templates.map((t) => ({ label: t.name, value: t.id }))} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="segmentId" label="Segment" rules={[{ required: true }]}>
                <Select options={segments.map((s) => ({ label: s.name, value: s.id }))} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="smtpConfigId" label="SMTP" rules={[{ required: true }]}>
                <Select options={smtps.map((s) => ({ label: s.label, value: s.id }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="subject" label="Objet (surcharge template)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="scheduledAt" label="Planifier à (optionnel)">
                <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="dailyLimit" label="Plafond envois / jour (campagne)">
                <InputNumber min={1} max={50000} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Paragraph strong style={{ marginTop: 8 }}>
            Options avancées
          </Paragraph>
          <Form.Item name="throttleMinDelayMs" label="Délai min. entre deux envois (ms)">
            <InputNumber min={0} max={600000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="bodyHtmlOverride" label="Corps HTML (remplace le template si renseigné)">
            <Input.TextArea rows={3} placeholder="Laisser vide pour utiliser le template" />
          </Form.Item>
          <Form.Item
            name="aiPersonalize"
            label="Personnalisation IA par destinataire (F2/F3)"
            valuePropName="checked"
            tooltip="Chaque email est réécrit par l'IA, unique et adapté au lead. Utilise la clé OpenAI du créateur de la campagne (Configuration → Intégration IA)."
          >
            <Switch />
          </Form.Item>
          <Form.Item name="abEnabled" label="Test A/B" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="abSubjectB" label="Objet variante B">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="abSplitPercent" label="% vers B">
                <InputNumber min={0} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="abBodyHtmlB" label="HTML variante B">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="warmupEnabled" label="Montée en charge du domaine (warm-up)" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="warmupStart" label="Plafond départ / jour">
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warmupGrowth" label="Croissance quotidienne (coeff.)">
                <InputNumber min={1} max={3} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer
        title={detailCampaign ? `Détails campagne — ${detailCampaign.name}` : "Détails campagne"}
        open={campaignDetailOpen}
        onClose={closeDetails}
        width={520}
      >
        {detailCampaign ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Nom">{detailCampaign.name}</Descriptions.Item>
            <Descriptions.Item label="Statut">
              <Tag color={STATUS_COL[detailCampaign.status] ?? "default"}>{detailCampaign.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Template">{detailCampaign.template?.name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Segment">{detailCampaign.segment?.name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="SMTP">{detailCampaign.smtpConfig?.label ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Objet">{detailCampaign.subject ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Planifiée à">{detailCampaign.scheduledAt ? dayjs(detailCampaign.scheduledAt).format("DD/MM/YYYY HH:mm") : "—"}</Descriptions.Item>
            <Descriptions.Item label="Limite journalière">{detailCampaign.dailyLimit ?? "—"}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>

      <Drawer
        title={detailSegment ? `Détails segment — ${detailSegment.name}` : "Détails segment"}
        open={segmentDetailOpen}
        onClose={closeDetails}
        width={520}
      >
        {detailSegment ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Nom">{detailSegment.name}</Descriptions.Item>
            <Descriptions.Item label="Créé">{dayjs(detailSegment.createdAt).format("DD/MM/YYYY HH:mm")}</Descriptions.Item>
            <Descriptions.Item label="Filtres">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(detailSegment.filters, null, 2)}</pre>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>

      <Drawer title={statsCamp ? `Stats — ${statsCamp.name}` : "Stats"} open={statsOpen} onClose={() => setStatsOpen(false)} width={400}>
        {stats ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Envoyés (SENT)">{stats.sent}</Descriptions.Item>
            <Descriptions.Item label="Ouverts">{stats.opens}</Descriptions.Item>
            <Descriptions.Item label="Clics">{stats.clicks}</Descriptions.Item>
            <Descriptions.Item label="Bounces">{stats.bounces}</Descriptions.Item>
            <Descriptions.Item label="Désabonnements">{stats.unsubscribes}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">Chargement…</Text>
        )}
        <Paragraph type="secondary" style={{ marginTop: 16 }}>
          Les compteurs agrègent les événements enregistrés dans <Text code>emailEvents</Text> (envois, ouvertures, clics, bounces, désabonnements).
        </Paragraph>
      </Drawer>
    </Space>
  );
}
