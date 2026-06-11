"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
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
  FileAddOutlined,
  DeleteOutlined,
  FileMarkdownOutlined,
  UploadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/client";
import { smtpSelectOptions, type SmtpOptionLike } from "@/lib/emailAccounts";
import { useIsMobile } from "@/lib/responsive";
import { labelWithHelp } from "@/components/ui/FieldHelp";

const { Title, Text, Paragraph } = Typography;

type TemplateOpt = { id: string; name: string; subject: string };
type SmtpOpt = SmtpOptionLike;
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
  const [tagsRef, setTagsRef] = useState<{ name: string }[]>([]);
  const [leadOptions, setLeadOptions] = useState<{ label: string; value: string }[]>([]);
  const [segPreview, setSegPreview] = useState<{
    data: { id: string; firstName: string | null; lastName: string | null; company: string | null; email: string | null; status: string; score: number }[];
    total: number;
  } | null>(null);
  const [segPreviewLoading, setSegPreviewLoading] = useState(false);
  const [detailSegmentLeads, setDetailSegmentLeads] = useState<typeof segPreview extends null ? never : NonNullable<typeof segPreview> | null>(null);
  const [detailLeadsLoading, setDetailLeadsLoading] = useState(false);
  const [campKnowledgeDocs, setCampKnowledgeDocs] = useState<
    { id: string; name: string; content: string; createdAt: string }[]
  >([]);
  const [knowledgeBases, setKnowledgeBases] = useState<{ id: string; name: string }[]>([]);
  const [campEditorStep, setCampEditorStep] = useState(0);
  const segMode = Form.useWatch("segMode", segForm) ?? "filter";

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
    api.get<{ data: { name: string }[] }>("/tags").then((r) => setTagsRef(r.data.data ?? [])).catch(() => {});
    api.get<{ data: { id: string; name: string }[] }>("/knowledge-bases").then((r) => setKnowledgeBases(r.data.data ?? [])).catch(() => {});
    api.get<{ data: { id: string; firstName: string | null; lastName: string | null; company: string | null; email: string | null }[] }>(
      "/leads",
      { params: { pageSize: 200 } },
    ).then((r) => {
      setLeadOptions(
        (r.data.data ?? []).map((l) => ({
          value: l.id,
          label: [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || l.email || l.id.slice(0, 8),
        })),
      );
    }).catch(() => {});
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
        autoResponder: v.arMode && v.arMode !== "off"
          ? { mode: v.arMode as string, meetingUrl: (v.arMeetingUrl as string) || "" }
          : { mode: "off" },
        knowledgeText: (v.knowledgeText as string)?.trim() || null,
        knowledgeDocs: campKnowledgeDocs,
        knowledgeBaseId: v.knowledgeBaseId || null,
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
        setCampKnowledgeDocs([]);
        setCampEditorStep(0);
      }
      void load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error(editingCampaign ? "Mise à jour impossible" : "Création impossible");
    }
  };

  const buildSegmentFilters = (v: Record<string, unknown>): Record<string, unknown> => {
    const mode = (v.segMode as string) ?? "filter";
    if (mode === "manual") {
      return { mode: "manual", leadIds: (v.leadIds as string[]) ?? [] };
    }
    if (mode === "tags") {
      return { mode: "tags", tags: (v.segTags as string[]) ?? [] };
    }
    const filters: Record<string, unknown> = { mode: "filter" };
    if (v.fStatus) filters.status = v.fStatus;
    if (v.fTag) filters.tag = v.fTag;
    if (v.fSector) filters.sector = v.fSector;
    if (v.fScoreMin != null) filters.scoreMin = v.fScoreMin;
    if (v.fScoreMax != null) filters.scoreMax = v.fScoreMax;
    return filters;
  };

  const previewSegment = async () => {
    setSegPreviewLoading(true);
    try {
      const v = segForm.getFieldsValue();
      const filters = buildSegmentFilters(v);
      const { data } = await api.post<{
        data: { id: string; firstName: string | null; lastName: string | null; company: string | null; email: string | null; status: string; score: number }[];
        total: number;
      }>("/segments/preview", { filters, page: 1, pageSize: 15 });
      setSegPreview({ data: data.data, total: data.total });
    } catch {
      message.error("Aperçu impossible");
    } finally {
      setSegPreviewLoading(false);
    }
  };

  const saveSegment = async () => {
    try {
      const v = await segForm.validateFields();
      const filters = buildSegmentFilters(v);
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
        setSegPreview(null);
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
      setCampEditorStep(0);
      setCampModal(true);
      const config = (campaign.config ?? {}) as Record<string, unknown>;
      const ab = (config.ab ?? {}) as Record<string, unknown>;
      const warmup = (config.warmup ?? {}) as Record<string, unknown>;
      const ar = (config.autoResponder ?? {}) as Record<string, unknown>;
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
        arMode: (ar.mode as string) ?? "off",
        arMeetingUrl: (ar.meetingUrl as string) ?? undefined,
        knowledgeText: (config.knowledgeText as string) ?? "",
        knowledgeBaseId: (config.knowledgeBaseId as string) ?? undefined,
      });
      const docs = Array.isArray(config.knowledgeDocs) ? config.knowledgeDocs : [];
      setCampKnowledgeDocs(
        docs
          .filter((d): d is { id: string; name: string; content: string; createdAt?: string } =>
            Boolean(d && typeof d === "object" && (d as { id?: string }).id),
          )
          .map((d) => ({
            id: d.id,
            name: d.name,
            content: d.content,
            createdAt: d.createdAt ?? new Date().toISOString(),
          })),
      );
    } catch {
      message.error("Impossible de charger la campagne");
    }
  };

  const openEditSegment = async (row: SegmentRow) => {
    setEditingSegment(row);
    setSegModalMessage(null);
    setSegPreview(null);
    setSegModal(true);
    const filters = row.filters as Record<string, unknown>;
    const mode = (filters.mode as string) ?? "filter";
    segForm.setFieldsValue({
      name: row.name,
      segMode: mode,
      fStatus: filters.status ?? undefined,
      fTag: filters.tag ?? undefined,
      fSector: filters.sector ?? undefined,
      fScoreMin: filters.scoreMin ?? undefined,
      fScoreMax: filters.scoreMax ?? undefined,
      leadIds: filters.leadIds ?? [],
      segTags: filters.tags ?? [],
    });
  };

  const loadDetailSegmentLeads = async (segmentId: string) => {
    setDetailLeadsLoading(true);
    try {
      const { data } = await api.get<{
        data: { id: string; firstName: string | null; lastName: string | null; company: string | null; email: string | null; status: string; score: number }[];
        total: number;
      }>(`/segments/${segmentId}/leads`, { params: { page: 1, pageSize: 50 } });
      setDetailSegmentLeads({ data: data.data, total: data.total });
    } catch {
      setDetailSegmentLeads(null);
    } finally {
      setDetailLeadsLoading(false);
    }
  };

  const openCampaignDetails = (row: CampaignRow) => {
    setDetailCampaign(row);
    setCampaignDetailOpen(true);
  };

  const openSegmentDetails = (row: SegmentRow) => {
    setDetailSegment(row);
    setSegmentDetailOpen(true);
    setDetailSegmentLeads(null);
    void loadDetailSegmentLeads(row.id);
  };

  const closeDetails = () => {
    setCampaignDetailOpen(false);
    setSegmentDetailOpen(false);
    setDetailCampaign(null);
    setDetailSegment(null);
    setDetailSegmentLeads(null);
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
      <div className="page-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <MailOutlined /> Campagnes emailing
          </Title>
          <Text type="secondary">
            Créez des segments sur vos leads, planifiez des campagnes avec envoi régulé, suivez ouvertures et clics,
            gérez les bounces et les désabonnements (RFC 8058), et affinez la délivrabilité avec montée en charge et tests A/B.
          </Text>
        </div>
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
            <Link href="/settings?tab=emailing&newTemplate=1">
              <Button type="default" icon={<FileAddOutlined />}>Créer un template</Button>
            </Link>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCampEditorStep(0); setCampModal(true); setEditingCampaign(null); setCampKnowledgeDocs([]); campForm.resetFields(); }}>
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
        onCancel={() => { setSegModal(false); setEditingSegment(null); setSegModalMessage(null); setSegPreview(null); segForm.resetFields(); }}
        width={720}
        okText={editingSegment ? "Enregistrer" : "Créer"}
      >
        <Form form={segForm} layout="vertical" initialValues={{ segMode: "filter" }}>
          {segModalMessage ? (
            <Alert type={segModalMessage.type} message={segModalMessage.message} showIcon style={{ marginBottom: 16 }} />
          ) : null}
          <Form.Item name="name" label={labelWithHelp("Nom", "Identifiant interne du segment pour le retrouver lors de la création de campagnes.")} rules={[{ required: true }]}>
            <Input placeholder="Ex: Prospects IT France" />
          </Form.Item>
          <Form.Item
            name="segMode"
            label={labelWithHelp(
              "Type de segment",
              "Filtres dynamiques : critères automatiques. Manuel : liste fixe de leads. Par tags : tous les leads portant au moins un des tags choisis.",
            )}
          >
            <Select
              options={[
                { label: "Filtres dynamiques (statut, score…)", value: "filter" },
                { label: "Sélection manuelle de leads", value: "manual" },
                { label: "Par tags", value: "tags" },
              ]}
            />
          </Form.Item>

          {segMode === "filter" && (
            <>
              <Text type="secondary">Filtres — même logique que la liste Leads</Text>
              <Row gutter={8} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Form.Item name="fStatus" label="Statut">
                    <Select allowClear placeholder="Tous" options={["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"].map((s) => ({ label: s, value: s }))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="fTag" label="Tag">
                    <Select
                      allowClear
                      showSearch
                      placeholder="Choisir un tag"
                      options={tagsRef.map((t) => ({ label: t.name, value: t.name }))}
                    />
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
            </>
          )}

          {segMode === "manual" && (
            <Form.Item name="leadIds" label="Leads sélectionnés" rules={[{ required: true, message: "Sélectionnez au moins un lead" }]}>
              <Select
                mode="multiple"
                showSearch
                placeholder="Rechercher et sélectionner des leads…"
                options={leadOptions}
                optionFilterProp="label"
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}

          {segMode === "tags" && (
            <Form.Item name="segTags" label="Tags (au moins un tag correspond)" rules={[{ required: true, message: "Sélectionnez au moins un tag" }]}>
              <Select
                mode="tags"
                placeholder="Sélectionner ou créer des tags…"
                options={tagsRef.map((t) => ({ label: t.name, value: t.name }))}
                tokenSeparators={[","]}
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}

          <Space style={{ marginBottom: 12 }}>
            <Button loading={segPreviewLoading} onClick={() => void previewSegment()}>
              Aperçu des leads ciblés
            </Button>
            {segPreview && (
              <Text type="secondary">{segPreview.total} lead(s) correspondant(s)</Text>
            )}
          </Space>

          {segPreview && (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={segPreview.data}
              columns={[
                {
                  title: "Contact",
                  key: "name",
                  render: (_, r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || r.company || "—",
                },
                { title: "Email", dataIndex: "email", ellipsis: true, render: (v) => v ?? "—" },
                { title: "Statut", dataIndex: "status", width: 100, render: (s) => <Tag>{s}</Tag> },
                { title: "Score", dataIndex: "score", width: 70 },
              ]}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={editingCampaign ? "Modifier la campagne" : "Nouvelle campagne"}
        open={campModal}
        onCancel={() => { setCampModal(false); setEditingCampaign(null); setCampModalMessage(null); campForm.resetFields(); setCampKnowledgeDocs([]); setCampEditorStep(0); }}
        width={720}
        footer={
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            {campEditorStep > 0 && (
              <Button onClick={() => setCampEditorStep((s) => s - 1)}>Retour</Button>
            )}
            {campEditorStep < 1 ? (
              <Button
                type="primary"
                disabled={editingCampaignNotEditable}
                onClick={async () => {
                  try {
                    await campForm.validateFields(["name", "templateId", "segmentId", "smtpConfigId", "subject"]);
                    setCampEditorStep(1);
                  } catch { /* erreurs affichées par Ant Design */ }
                }}
              >
                Suivant
              </Button>
            ) : (
              <Button type="primary" disabled={editingCampaignNotEditable} onClick={() => void saveCampaign()}>
                {editingCampaign ? "Enregistrer" : "Créer"}
              </Button>
            )}
            <Button onClick={() => { setCampModal(false); setEditingCampaign(null); setCampModalMessage(null); campForm.resetFields(); setCampKnowledgeDocs([]); setCampEditorStep(0); }}>
              Annuler
            </Button>
          </Space>
        }
      >
        <Steps
          current={campEditorStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: "Paramètres généraux", icon: <MailOutlined /> },
            { title: "Options & IA", icon: <ThunderboltOutlined /> },
          ]}
        />
        <Form form={campForm} layout="vertical" initialValues={{ abSplitPercent: 50, throttleMinDelayMs: 12000, warmupStart: 40, warmupGrowth: 1.15, arMode: "off" }}>
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
          <div style={{ display: campEditorStep === 0 ? "block" : "none" }}>
          <Form.Item name="name" label={labelWithHelp("Nom de la campagne", "Identifiant interne pour retrouver la campagne dans la liste et les statistiques.")} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item
                name="templateId"
                label={labelWithHelp("Template", "Modèle d'email (objet + corps HTML) créé dans Configuration → Emailing. Utilisez « Créer un template » si besoin.")}
                rules={[{ required: true }]}
              >
                <Select options={templates.map((t) => ({ label: t.name, value: t.id }))} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="segmentId"
                label={labelWithHelp("Segment", "Audience cible : ensemble de leads filtrés, sélectionnés manuellement ou regroupés par tags.")}
                rules={[{ required: true }]}
              >
                <Select options={segments.map((s) => ({ label: s.name, value: s.id }))} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="smtpConfigId"
                label={labelWithHelp("SMTP", "Serveur d'envoi configuré dans Configuration → Emailing. Détermine l'adresse expéditeur et la délivrabilité.")}
                rules={[{ required: true }]}
              >
                <Select options={smtpSelectOptions(smtps)} showSearch optionFilterProp="label" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="subject"
            label={labelWithHelp("Objet (surcharge template)", "Remplace l'objet défini dans le template. Variables {{firstName}}, {{company}} supportées selon le template.")}
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="scheduledAt"
                label={labelWithHelp("Planifier à (optionnel)", "Date et heure de démarrage. Laissez vide pour lancer manuellement via le bouton « Lancer ».")}
              >
                <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="dailyLimit"
                label={labelWithHelp("Plafond envois / jour", "Nombre maximum d'emails envoyés par jour pour cette campagne. Protège votre réputation d'expéditeur.")}
              >
                <InputNumber min={1} max={50000} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          </div>
          <div style={{ display: campEditorStep === 1 ? "block" : "none" }}>
          <Paragraph strong style={{ marginTop: 8 }}>
            Options avancées
          </Paragraph>
          <Form.Item
            name="throttleMinDelayMs"
            label={labelWithHelp("Délai min. entre deux envois (ms)", "Pause entre chaque email pour éviter d'être flaggé comme spam. 12 000 ms (12 s) est un bon défaut.")}
          >
            <InputNumber min={0} max={600000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="bodyHtmlOverride"
            label={labelWithHelp("Corps HTML (remplace le template)", "Si renseigné, ignore le HTML du template pour cette campagne uniquement.")}
          >
            <Input.TextArea rows={3} placeholder="Laisser vide pour utiliser le template" />
          </Form.Item>
          <Form.Item
            name="aiPersonalize"
            label={labelWithHelp(
              "Personnalisation IA par destinataire",
              "Chaque email est réécrit par l'IA pour être unique et adapté au lead (approche, brief). Utilise votre clé OpenAI, la base globale (Configuration → Intégration IA) et la base spécifique à cette campagne ci-dessous.",
            )}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="abEnabled"
            label={labelWithHelp("Test A/B", "Envoie deux variantes (A et B) à des sous-ensembles du segment pour comparer les performances.")}
            valuePropName="checked"
          >
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
          <Form.Item name="warmupEnabled" label={labelWithHelp("Montée en charge (warm-up)", "Augmente progressivement le volume d'envois quotidien pour chauffer un nouveau domaine ou une nouvelle IP SMTP.")} valuePropName="checked">
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
          <Paragraph strong style={{ marginTop: 8 }}>
            Base de connaissances IA (campagne)
          </Paragraph>
          <Form.Item
            name="knowledgeBaseId"
            label={labelWithHelp("Base de connaissances partagée", "Sélectionnez une base enregistrée dans Configuration → Bases de connaissances.")}
          >
            <Select
              allowClear
              placeholder="Choisir une base…"
              options={knowledgeBases.map((kb) => ({ value: kb.id, label: kb.name }))}
            />
          </Form.Item>
          <Form.Item
            name="knowledgeText"
            label={labelWithHelp(
              "Consignes et contexte (texte)",
              "Offres, ton, arguments commerciaux spécifiques à cette campagne. L'IA les utilise pour personnaliser les emails et les réponses automatiques.",
            )}
          >
            <Input.TextArea rows={4} placeholder="Ex : nous ciblons les PME du retail, offre découverte 30 jours…" />
          </Form.Item>
          <Form.Item label={labelWithHelp("Documents Markdown", "Importez des fichiers .md (max 10, 8 000 caractères chacun) pour enrichir le contexte IA de cette campagne.")}>
            <Upload
              accept=".md,.txt,text/markdown,text/plain"
              showUploadList={false}
              beforeUpload={async (file) => {
                if (campKnowledgeDocs.length >= 10) {
                  message.warning("Maximum 10 documents par campagne.");
                  return false;
                }
                const content = await file.text();
                if (content.length > 8000) {
                  message.warning("Document trop volumineux (max 8 000 caractères).");
                  return false;
                }
                setCampKnowledgeDocs((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: file.name.replace(/\.md$/i, ""),
                    content: content.trim(),
                    createdAt: new Date().toISOString(),
                  },
                ]);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>Ajouter un fichier .md</Button>
            </Upload>
          </Form.Item>
          {campKnowledgeDocs.length > 0 && (
            <List
              size="small"
              style={{ marginBottom: 16 }}
              dataSource={campKnowledgeDocs}
              renderItem={(doc) => (
                <List.Item
                  actions={[
                    <Button
                      key="del"
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => setCampKnowledgeDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                    />,
                  ]}
                >
                  <Space>
                    <FileMarkdownOutlined />
                    <Text>{doc.name}</Text>
                    <Text type="secondary">({doc.content.length} car.)</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
          <Paragraph strong style={{ marginTop: 8 }}>
            Auto-répondeur IA (par campagne)
          </Paragraph>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="arMode"
                label={labelWithHelp("Mode auto-répondeur", "Définit comment répondre automatiquement aux emails reçus de leads de cette campagne. « Brouillon » : génère un brouillon pour validation humaine. « Auto » : envoie directement.")}
                initialValue="off"
              >
                <Select
                  options={[
                    { label: "Désactivé", value: "off" },
                    { label: "Brouillon (validation humaine)", value: "draft" },
                    { label: "Auto (envoi direct)", value: "auto" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="arMeetingUrl"
                label={labelWithHelp("Lien RDV (pour réponses positives)", "URL Calendly ou agenda envoyée dans la réponse IA aux leads intéressés.")}
              >
                <Input placeholder="https://calendly.com/..." />
              </Form.Item>
            </Col>
          </Row>
          </div>
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
        width={720}
      >
        {detailSegment ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Nom">{detailSegment.name}</Descriptions.Item>
              <Descriptions.Item label="Créé">{dayjs(detailSegment.createdAt).format("DD/MM/YYYY HH:mm")}</Descriptions.Item>
              <Descriptions.Item label="Type">
                {(() => {
                  const f = detailSegment.filters as Record<string, unknown>;
                  if (f.mode === "manual") return "Sélection manuelle";
                  if (f.mode === "tags") return "Par tags";
                  return "Filtres dynamiques";
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="Critères">
                <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 11 }}>{JSON.stringify(detailSegment.filters, null, 2)}</pre>
              </Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Leads ciblés</Title>
              <Table
                size="small"
                rowKey="id"
                loading={detailLeadsLoading}
                dataSource={detailSegmentLeads?.data ?? []}
                pagination={false}
                columns={[
                  {
                    title: "Contact",
                    key: "name",
                    render: (_, r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || r.company || "—",
                  },
                  { title: "Email", dataIndex: "email", ellipsis: true, render: (v) => v ?? "—" },
                  { title: "Statut", dataIndex: "status", width: 100, render: (s) => <Tag>{s}</Tag> },
                  { title: "Score", dataIndex: "score", width: 70 },
                ]}
                footer={() =>
                  detailSegmentLeads ? (
                    <Text type="secondary">{detailSegmentLeads.total} lead(s) au total</Text>
                  ) : null
                }
              />
            </div>
          </Space>
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
