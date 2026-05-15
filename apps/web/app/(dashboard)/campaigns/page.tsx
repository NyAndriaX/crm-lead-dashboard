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
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
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
      await api.post("/campaigns", {
        name: v.name,
        templateId: v.templateId,
        segmentId: v.segmentId,
        smtpConfigId: v.smtpConfigId,
        subject: v.subject,
        scheduledAt: v.scheduledAt ? v.scheduledAt.toDate() : null,
        dailyLimit: v.dailyLimit ?? null,
        config,
      });
      message.success("Campagne créée");
      setCampModal(false);
      campForm.resetFields();
      void load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error("Création impossible");
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
      await api.post("/segments", { name: v.name, filters });
      message.success("Segment créé");
      setSegModal(false);
      segForm.resetFields();
      void load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error("Segment impossible");
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
        width: isMobile ? 120 : 320,
        render: (_, r) => (
          <Space wrap size={4}>
            <Button size="small" icon={<BarChartOutlined />} onClick={() => void openStats(r)}>
              Stats
            </Button>
            {r.status === "DRAFT" || r.status === "PAUSED" ? (
              <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => (r.status === "PAUSED" ? void resume(r.id) : void schedule(r.id))}>
                {r.status === "PAUSED" ? "Reprendre" : "Lancer"}
              </Button>
            ) : null}
            {r.status === "SCHEDULED" || r.status === "SENDING" ? (
              <Button size="small" icon={<PauseCircleOutlined />} onClick={() => void pause(r.id)}>
                Pause
              </Button>
            ) : null}
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setSegModal(true)}>
            Nouveau segment
          </Button>
        }
      >
        <Table<SegmentRow>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={segments}
          pagination={{ pageSize: 6 }}
          columns={[
            { title: "Nom", dataIndex: "name", key: "name" },
            { title: "Créé", dataIndex: "createdAt", key: "c", render: (d: string) => dayjs(d).format("DD/MM/YYYY HH:mm") },
          ]}
        />
      </Card>

      <Card
        title={<Space><PlayCircleOutlined />Campagnes</Space>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCampModal(true)}>
            Nouvelle campagne
          </Button>
        }
      >
        <Table<CampaignRow> rowKey="id" loading={loading} columns={cols} dataSource={campaigns} scroll={{ x: 900 }} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal
        title="Nouveau segment"
        open={segModal}
        onOk={() => void saveSegment()}
        onCancel={() => { setSegModal(false); segForm.resetFields(); }}
        width={520}
        okText="Créer"
      >
        <Form form={segForm} layout="vertical">
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
        title="Nouvelle campagne"
        open={campModal}
        onOk={() => void saveCampaign()}
        onCancel={() => { setCampModal(false); campForm.resetFields(); }}
        width={720}
        okText="Créer"
      >
        <Form form={campForm} layout="vertical" initialValues={{ abSplitPercent: 50, throttleMinDelayMs: 12000, warmupStart: 40, warmupGrowth: 1.15 }}>
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
            tooltip="Chaque email est réécrit par l'IA, unique et adapté au lead (utilise l'enrichissement + le brief IA). Fallback variables si OPENAI_API_KEY absent."
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
