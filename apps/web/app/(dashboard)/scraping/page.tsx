"use client";

/**
 * Page /scraping — module Scraping (S-01 → S-10).
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Alert, Badge, Button, Card, Col, DatePicker, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Progress, Result, Row, Select, Space, Spin, Statistic,
  Switch, Table, Tag, Timeline, Tooltip, Typography, message,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  CheckCircleOutlined, CheckOutlined, CloseCircleOutlined, CloseOutlined,
  CloudDownloadOutlined, DatabaseOutlined, DeleteOutlined, EditOutlined,
  FileSearchOutlined, FilterOutlined, PlayCircleOutlined, PlusOutlined,
  RadarChartOutlined, ReloadOutlined, RocketOutlined, WarningOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type InjectResult = { injected: number; skippedDuplicate: number; skippedInvalid: number };

type Mission = {
  id: string;
  name: string;
  config: {
    keywords: string;
    location: { city?: string | null; country?: string | null; radiusKm?: number | null };
    limit: number;
    detailed: boolean;
    locale: string;
    filter_country: boolean;
    requireEmail: boolean;
    dailyQuota?: number | null;
    injectionTags?: string[];
    autoPipeline?: { enabled: boolean; sequenceId?: string | null; tags?: string[] };
    schedulePlan?: {
      mode: "manual" | "once" | "recurring";
      runAt?: string | null;
      frequency?: "daily" | "weekly" | "monthly" | null;
    };
  };
  schedule: string | null;
  scheduleLabel: string;
  status: string;
  logs: string | null;
  createdAt: string;
  bufferCounts: { pending: number; accepted: number; rejected: number };
};

type BufferItem = {
  id: string;
  status: string;
  raw: {
    company?: string | null; name?: string | null; email?: string | null;
    phone?: string | null; website?: string | null; city?: string | null;
    sector?: string | null; source?: string; rating?: number | null;
    reviews?: number | null; email_status?: string | null;
    place_id?: string | null; duplicate?: boolean; duplicateReason?: string | null;
    enrichment?: string | null;
  };
  createdAt: string;
};

const EMAIL_STATUS_TAG: Record<string, { color: string; label: string }> = {
  found: { color: "green", label: "email OK" },
  found_legal: { color: "blue", label: "email légal" },
  no_email: { color: "default", label: "sans email" },
  no_website: { color: "orange", label: "sans site" },
  unreachable: { color: "volcano", label: "site injoignable" },
  invalid_email: { color: "red", label: "email invalide" },
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: "default", label: "En attente" },
  scheduled: { color: "purple", label: "Planifiée" },
  queued: { color: "blue", label: "En file" },
  running: { color: "processing", label: "En cours" },
  done: { color: "green", label: "Terminée" },
  error: { color: "red", label: "Erreur" },
};

function buildSchedulePlan(v: {
  scheduleMode: string;
  scheduleRunAt?: Dayjs | null;
  scheduleFrequency?: string | null;
}) {
  const mode = v.scheduleMode as "manual" | "once" | "recurring";
  if (mode === "manual") return { mode: "manual" as const };
  return {
    mode,
    runAt: v.scheduleRunAt ? v.scheduleRunAt.toISOString() : null,
    frequency: mode === "recurring" ? (v.scheduleFrequency as "daily" | "weekly" | "monthly") ?? "daily" : null,
  };
}

function ScrapingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoOpenRef = useRef<string | null>(searchParams.get("openResults"));

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [logsTarget, setLogsTarget] = useState<Mission | null>(null);
  const [resultsTarget, setResultsTarget] = useState<Mission | null>(null);
  const [buffer, setBuffer] = useState<BufferItem[]>([]);
  const [bufferLoading, setBufferLoading] = useState(false);
  const [selectedBuf, setSelectedBuf] = useState<string[]>([]);
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<InjectResult | null>(null);
  const [injectionTags, setInjectionTags] = useState<string[]>([]);
  const [tagsRef, setTagsRef] = useState<{ name: string }[]>([]);

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Mission[] }>("/scraping/missions");
      setMissions(data.data);
    } catch {
      message.error("Impossible de charger les missions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMissions(); }, [fetchMissions]);

  useEffect(() => {
    api.get<{ data: { name: string }[] }>("/tags").then((r) => setTagsRef(r.data.data ?? [])).catch(() => {});
  }, []);


  // Auto-refresh tant qu'une mission tourne.
  useEffect(() => {
    if (!missions.some((m) => m.status === "running" || m.status === "queued")) return;
    const t = setInterval(() => void fetchMissions(), 4000);
    return () => clearInterval(t);
  }, [missions, fetchMissions]);

  // Ouvre automatiquement le drawer résultats si ?openResults=<id> est présent (lien notif).
  useEffect(() => {
    const targetId = autoOpenRef.current;
    if (!targetId || missions.length === 0) return;
    const mission = missions.find((m) => m.id === targetId);
    if (mission) {
      autoOpenRef.current = null; // consomme le param une seule fois
      openResults(mission);
      // Nettoie l'URL sans recharger la page
      const url = new URL(window.location.href);
      url.searchParams.delete("openResults");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      keywords: "Immobilier",
      limit: 10,
      locale: "fr-FR",
      country: "France",
      detailed: true,
      filter_country: true,
      requireEmail: true,
      scheduleMode: "manual",
    });
    setFormOpen(true);
  }

  function openEdit(m: Mission) {
    setEditing(m);
    const plan = m.config.schedulePlan ?? { mode: "manual" as const };
    form.setFieldsValue({
      name: m.name,
      keywords: m.config.keywords,
      city: m.config.location.city,
      country: m.config.location.country,
      limit: m.config.limit,
      locale: m.config.locale ?? "fr-FR",
      detailed: m.config.detailed ?? true,
      filter_country: m.config.filter_country ?? true,
      requireEmail: m.config.requireEmail !== false,
      scheduleMode: plan.mode,
      scheduleRunAt: plan.runAt ? dayjs(plan.runAt) : null,
      scheduleFrequency: plan.frequency ?? "daily",
      dailyQuota: m.config.dailyQuota ?? null,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const v = await form.validateFields();
    setSaving(true);
    const body = {
      name: v.name,
      config: {
        keywords: v.keywords ?? "",
        location: { city: v.city || null, country: v.country || "France", radiusKm: null },
        limit: v.limit ?? 10,
        detailed: v.detailed ?? true,
        locale: v.locale || "fr-FR",
        filter_country: v.filter_country ?? true,
        requireEmail: Boolean(v.requireEmail),
        schedulePlan: buildSchedulePlan(v),
        dailyQuota: v.dailyQuota ?? null,
      },
    };
    try {
      if (editing) {
        await api.put(`/scraping/missions/${editing.id}`, body);
        message.success("Mission mise à jour");
      } else {
        await api.post("/scraping/missions", body);
        message.success("Mission créée");
      }
      setFormOpen(false);
      void fetchMissions();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function runMission(m: Mission) {
    try {
      const { data } = await api.post<{ data: { message?: string } }>(`/scraping/missions/${m.id}/run`);
      message.success(
        data.data.message ??
          "Scraping lancé en arrière-plan — notification à la fin.",
        8,
      );
      void fetchMissions();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur");
    }
  }

  async function removeMission(m: Mission) {
    try {
      await api.delete(`/scraping/missions/${m.id}`);
      message.success("Mission supprimée");
      void fetchMissions();
    } catch {
      message.error("Suppression impossible");
    }
  }

  const loadBuffer = useCallback(async (missionId: string) => {
    setBufferLoading(true);
    try {
      const { data } = await api.get<{ data: BufferItem[] }>(`/scraping/missions/${missionId}/results`);
      setBuffer(data.data);
      setSelectedBuf([]);
    } catch {
      message.error("Impossible de charger les résultats.");
    } finally {
      setBufferLoading(false);
    }
  }, []);

  function openResults(m: Mission) {
    setResultsTarget(m);
    setInjectionTags(m.config.injectionTags ?? []);
    void loadBuffer(m.id);
  }

  async function reviewSelected(status: "accepted" | "rejected") {
    if (!resultsTarget || selectedBuf.length === 0) return;
    try {
      await api.patch(`/scraping/missions/${resultsTarget.id}/results`, { ids: selectedBuf, status });
      message.success(`${selectedBuf.length} ligne(s) ${status === "accepted" ? "acceptée(s)" : "rejetée(s)"}`);
      void loadBuffer(resultsTarget.id);
      void fetchMissions();
    } catch {
      message.error("Action impossible");
    }
  }

  async function injectAccepted() {
    if (!resultsTarget) return;
    setInjecting(true);
    setInjectResult(null);
    try {
      const { data } = await api.post<{ data: InjectResult }>(
        `/scraping/missions/${resultsTarget.id}/results`,
        { injectionTags: injectionTags.length ? injectionTags : undefined },
      );
      setInjectResult(data.data);
      void loadBuffer(resultsTarget.id);
      void fetchMissions();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Injection impossible");
    } finally {
      setInjecting(false);
    }
  }

  const missionCols: ColumnsType<Mission> = [
    {
      title: "Mission",
      key: "name",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {r.config.keywords || "(sans mots-clés)"} · {r.config.location.city || "France"}
          </Text>
        </Space>
      ),
    },
    {
      title: "Filtres",
      key: "filters",
      width: 120,
      render: (_, r) => (
        <Space size={2} wrap>
          {r.config.requireEmail && <Tag color="blue">email requis</Tag>}
          {r.config.filter_country && <Tag>France</Tag>}
        </Space>
      ),
    },
    {
      title: "Statut",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (v: string) => {
        const t = STATUS_TAG[v] ?? { color: "default", label: v };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: "Résultats buffer",
      key: "buffer",
      width: 220,
      render: (_, r) => {
        const total = r.bufferCounts.pending + r.bufferCounts.accepted + r.bufferCounts.rejected;
        if (total === 0) return <Text type="secondary" style={{ fontSize: 12 }}>Aucun résultat</Text>;
        return (
          <Space size={4} wrap>
            {r.bufferCounts.pending > 0 && (
              <Badge count={r.bufferCounts.pending} color="#faad14" overflowCount={999}>
                <Tag style={{ marginRight: 0 }}>à valider</Tag>
              </Badge>
            )}
            {r.bufferCounts.accepted > 0 && <Tag color="success">{r.bufferCounts.accepted} ✓</Tag>}
            {r.bufferCounts.rejected > 0 && <Tag color="error">{r.bufferCounts.rejected} ✗</Tag>}
          </Space>
        );
      },
    },
    {
      title: "Planif.",
      key: "schedule",
      width: 160,
      render: (_, r) =>
        r.scheduleLabel && r.scheduleLabel !== "Manuel"
          ? <Tag color="purple">{r.scheduleLabel}</Tag>
          : <Text type="secondary">Manuel</Text>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 240,
      render: (_, r) => {
        const isActive = r.status === "running" || r.status === "queued";
        const hasPending = r.bufferCounts.pending > 0 || r.bufferCounts.accepted > 0;
        return (
          <Space size={4} wrap>
            <Tooltip title={isActive ? "Mission en cours…" : "Lancer le scraping"}>
              <Button
                size="small"
                type="primary"
                icon={isActive ? <Spin size="small" /> : <PlayCircleOutlined />}
                disabled={isActive}
                onClick={() => void runMission(r)}
              >
                Lancer
              </Button>
            </Tooltip>
            <Tooltip title={hasPending ? "Voir et valider les leads" : "Aucun lead à valider"}>
              <Badge dot={r.bufferCounts.pending > 0} offset={[-4, 4]}>
                <Button
                  size="small"
                  icon={<FileSearchOutlined />}
                  onClick={() => openResults(r)}
                >
                  Résultats
                </Button>
              </Badge>
            </Tooltip>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
            <Button size="small" onClick={() => setLogsTarget(r)}>Logs</Button>
            <Popconfirm
              title={`Supprimer "${r.name}" ?`}
              description="Cette action est irréversible."
              onConfirm={() => void removeMission(r)}
              okText="Supprimer"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const bufCols: ColumnsType<BufferItem> = [
    {
      title: "Entreprise",
      key: "company",
      ellipsis: true,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{r.raw.company || "—"}</Text>
          {r.raw.sector && <Text type="secondary" style={{ fontSize: 11 }}>{r.raw.sector}</Text>}
        </Space>
      ),
    },
    {
      title: "Contact",
      key: "email",
      width: 200,
      ellipsis: true,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {r.raw.email
            ? <Text copyable style={{ fontSize: 12 }}>{r.raw.email}</Text>
            : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>}
          {r.raw.phone && <Text type="secondary" style={{ fontSize: 11 }}>{r.raw.phone}</Text>}
        </Space>
      ),
    },
    {
      title: "Qualif.",
      key: "email_status",
      width: 110,
      render: (_, r) => {
        const st = r.raw.email_status;
        if (!st) return <Text type="secondary">—</Text>;
        const t = EMAIL_STATUS_TAG[st] ?? { color: "default", label: st };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: "Note / Ville",
      key: "rating",
      width: 130,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {r.raw.rating != null && (
            <Text style={{ fontSize: 12 }}>
              ★ {r.raw.rating}{r.raw.reviews != null ? ` (${r.raw.reviews})` : ""}
            </Text>
          )}
          {r.raw.city && <Text type="secondary" style={{ fontSize: 11 }}>{r.raw.city}</Text>}
        </Space>
      ),
    },
    {
      title: "Statut",
      key: "status",
      width: 145,
      filters: [
        { text: "À valider", value: "pending" },
        { text: "Accepté", value: "accepted" },
        { text: "Rejeté", value: "rejected" },
      ],
      onFilter: (v, r) => r.status === v,
      render: (_, r) => {
        if (r.raw.duplicate) {
          return (
            <Tooltip title={r.raw.duplicateReason ?? "Doublon"}>
              <Tag icon={<WarningOutlined />} color="orange">Doublon</Tag>
            </Tooltip>
          );
        }
        if (r.status === "accepted") return <Tag icon={<CheckCircleOutlined />} color="success">Accepté</Tag>;
        if (r.status === "rejected") return <Tag icon={<CloseCircleOutlined />} color="error">Rejeté</Tag>;
        return <Tag color="default">À valider</Tag>;
      },
    },
  ];

  const pendingTotal = missions.reduce((s, m) => s + m.bufferCounts.pending, 0);
  const runningCount = missions.filter((m) => m.status === "running" || m.status === "queued").length;

  return (
    <div style={{ padding: "16px 24px" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Space align="center">
          <RadarChartOutlined style={{ fontSize: 26, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>Scraping Google Maps</Title>
          {runningCount > 0 && (
            <Badge
              count={`${runningCount} en cours`}
              style={{ backgroundColor: "#1677ff", fontSize: 11 }}
            />
          )}
          {pendingTotal > 0 && (
            <Badge
              count={`${pendingTotal} à valider`}
              style={{ backgroundColor: "#faad14", fontSize: 11 }}
            />
          )}
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchMissions()} loading={loading}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouvelle mission</Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        icon={<RocketOutlined />}
        style={{ marginBottom: 20, borderRadius: 8 }}
        message={<Text strong>Démarrage requis : scraper Google Maps sur le port 8000</Text>}
        description={
          <Space direction="vertical" size={2}>
            <Text style={{ fontSize: 12 }}>
              1) Dans <Text code>CRM_LEAD_SCRAPER</Text> : <Text code>./run.sh</Text> — 2) Ici : <Text code>yarn dev:all</Text>
            </Text>
            <Text style={{ fontSize: 12 }} type="secondary">
              Le scraping s'exécute en arrière-plan (sans timeout). Une notification apparaît dès que les leads sont prêts à valider.
            </Text>
          </Space>
        }
      />

      <Table
        rowKey="id"
        columns={missionCols}
        dataSource={missions}
        loading={loading}
        size="middle"
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 10, showTotal: (t) => `${t} mission(s)` }}
      />

      {/* Formulaire mission */}
      <Modal
        title={editing ? `Modifier « ${editing.name} »` : "Nouvelle mission de scraping"}
        open={formOpen}
        onOk={() => void submitForm()}
        onCancel={() => setFormOpen(false)}
        confirmLoading={saving}
        okText={editing ? "Enregistrer" : "Créer"}
        cancelText="Annuler"
        width={640}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Nom de la mission" rules={[{ required: true, max: 100 }]}>
            <Input placeholder="ex. Immobilier France Q2" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            Paramètres envoyés au scraper Google Maps (port 8000)
          </Paragraph>
          <Form.Item name="keywords" label="Mots-clés" rules={[{ required: true, message: "Requis" }]}>
            <Input placeholder="ex. Immobilier" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="city" label="Ville (optionnel)"><Input placeholder="Lyon" /></Form.Item></Col>
            <Col span={8}><Form.Item name="country" label="Pays"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="limit" label="Limite" rules={[{ required: true }]}>
                <InputNumber min={1} max={120} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="locale" label="Locale">
                <Select options={[
                  { value: "fr-FR", label: "fr-FR" },
                  { value: "en-US", label: "en-US" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="detailed" label="Emails sites" valuePropName="checked" tooltip="Visiter chaque site (detailed)">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="filter_country" label="Filtre pays" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="requireEmail" label="Email requis" valuePropName="checked" tooltip="Les fiches sans email ne sont pas enregistrées dans les résultats" initialValue={true}>
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>Planification</Paragraph>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="scheduleMode" label="Mode">
                <Select options={[
                  { value: "manual", label: "Manuel (bouton Lancer)" },
                  { value: "once", label: "Ponctuelle" },
                  { value: "recurring", label: "Récurrente" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.scheduleMode !== c.scheduleMode}>
                {() => {
                  const mode = form.getFieldValue("scheduleMode");
                  if (mode === "manual") return null;
                  return (
                    <Form.Item name="scheduleRunAt" label={mode === "once" ? "Date & heure" : "Première exécution"}>
                      <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.scheduleMode !== c.scheduleMode}>
                {() =>
                  form.getFieldValue("scheduleMode") === "recurring" ? (
                    <Form.Item name="scheduleFrequency" label="Fréquence">
                      <Select options={[
                        { value: "daily", label: "Quotidien" },
                        { value: "weekly", label: "Hebdomadaire" },
                        { value: "monthly", label: "Mensuel" },
                      ]} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="dailyQuota" label="Quota / exécution" tooltip="Plafond de leads scrapés par exécution (optionnel)">
            <InputNumber min={1} max={1000} style={{ width: "100%" }} placeholder="ex. 100 (illimité si vide)" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Logs */}
      <Drawer
        title={
          <Space>
            <FilterOutlined />
            <span>Logs — {logsTarget?.name}</span>
          </Space>
        }
        open={!!logsTarget}
        onClose={() => setLogsTarget(null)}
        width={580}
      >
        {logsTarget?.logs ? (
          <Timeline
            style={{ padding: "8px 0" }}
            items={logsTarget.logs.split("\n").filter(Boolean).map((line, i) => ({
              key: i,
              color: line.toLowerCase().includes("erreur") || line.toLowerCase().includes("error")
                ? "red"
                : line.toLowerCase().includes("✓") || line.toLowerCase().includes("terminé")
                  ? "green"
                  : "blue",
              children: <Text style={{ fontSize: 12 }}>{line}</Text>,
            }))}
          />
        ) : (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Text type="secondary">Aucun log disponible</Text>
          </div>
        )}
      </Drawer>

      {/* Résultats / validation (S-10) */}
      <Drawer
        title={
          <Space>
            <FileSearchOutlined style={{ color: "#1677ff" }} />
            <span>Résultats — <Text strong>{resultsTarget?.name}</Text></span>
          </Space>
        }
        open={!!resultsTarget}
        onClose={() => {
          setResultsTarget(null);
          setInjectResult(null);
          setSelectedBuf([]);
        }}
        width={1000}
        extra={
          <Space>
            <Button
              icon={<CheckOutlined />}
              disabled={selectedBuf.length === 0}
              onClick={() => void reviewSelected("accepted")}
            >
              Accepter ({selectedBuf.length})
            </Button>
            <Button
              icon={<CloseOutlined />}
              danger
              disabled={selectedBuf.length === 0}
              onClick={() => void reviewSelected("rejected")}
            >
              Rejeter ({selectedBuf.length})
            </Button>
            <Popconfirm
              title={<Text strong>Injecter dans le CRM ?</Text>}
              description={
                <Space direction="vertical" size={2}>
                  <Text style={{ fontSize: 12 }}>
                    {resultsTarget?.bufferCounts.accepted ?? 0} lead(s) accepté(s) seront ajoutés au CRM.
                  </Text>
                  <Text style={{ fontSize: 12 }} type="secondary">
                    Un re-dédoublonnage est effectué automatiquement avant insertion.
                  </Text>
                </Space>
              }
              onConfirm={() => void injectAccepted()}
              okText={injecting ? "Injection…" : "Confirmer l'injection"}
              okButtonProps={{ icon: <DatabaseOutlined />, loading: injecting, disabled: injecting }}
              icon={<DatabaseOutlined style={{ color: "#1677ff" }} />}
            >
              <Button
                type="primary"
                icon={injecting ? <Spin size="small" /> : <CloudDownloadOutlined />}
                loading={injecting}
                disabled={(resultsTarget?.bufferCounts.accepted ?? 0) === 0}
              >
                Injecter dans le CRM
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        {/* Tags à l'injection */}
        <Card size="small" style={{ marginBottom: 16 }} title="Tags à l'injection CRM">
          <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
            Tags appliqués aux leads lors de l'injection (en plus des tags système « scraping »).
          </Paragraph>
          <Select
            mode="tags"
            style={{ width: "100%" }}
            placeholder="Sélectionner ou créer des tags…"
            value={injectionTags}
            onChange={setInjectionTags}
            options={tagsRef.map((t) => ({ label: t.name, value: t.name }))}
            tokenSeparators={[","]}
          />
        </Card>

        {/* Résumé statistiques */}
        {resultsTarget && (
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
                <Statistic
                  title="À valider"
                  value={resultsTarget.bufferCounts.pending}
                  valueStyle={{ color: "#faad14", fontSize: 24 }}
                  suffix={<Text type="secondary" style={{ fontSize: 12 }}> leads</Text>}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
                <Statistic
                  title="Acceptés"
                  value={resultsTarget.bufferCounts.accepted}
                  valueStyle={{ color: "#52c41a", fontSize: 24 }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
                <Statistic
                  title="Rejetés / doublons"
                  value={resultsTarget.bufferCounts.rejected}
                  valueStyle={{ color: "#ff4d4f", fontSize: 24 }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" styles={{ body: { padding: "12px 16px" } }}>
                <Statistic
                  title="Total buffer"
                  value={
                    resultsTarget.bufferCounts.pending +
                    resultsTarget.bufferCounts.accepted +
                    resultsTarget.bufferCounts.rejected
                  }
                  valueStyle={{ fontSize: 24 }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* Résultat injection */}
        {injecting && (
          <Card style={{ marginBottom: 16, borderColor: "#1677ff", background: "#f0f7ff" }}>
            <Space align="center" style={{ width: "100%", justifyContent: "center" }} direction="vertical">
              <Spin size="large" />
              <Text strong>Injection en cours…</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Re-dédoublonnage et création des leads dans le CRM. Veuillez patienter.
              </Text>
              <Progress percent={99} status="active" showInfo={false} style={{ width: 300 }} />
            </Space>
          </Card>
        )}

        {injectResult && !injecting && (
          <Card
            style={{ marginBottom: 16, borderColor: "#52c41a", background: "#f6ffed" }}
            styles={{ body: { padding: 16 } }}
          >
            <Result
              status="success"
              icon={<CheckCircleOutlined style={{ color: "#52c41a", fontSize: 36 }} />}
              title={
                <Text strong style={{ fontSize: 16 }}>
                  {injectResult.injected} lead{injectResult.injected > 1 ? "s" : ""} injecté{injectResult.injected > 1 ? "s" : ""} dans le CRM
                </Text>
              }
              subTitle={
                <Space size="large" style={{ marginTop: 4 }}>
                  {injectResult.skippedDuplicate > 0 && (
                    <Space size={4}>
                      <WarningOutlined style={{ color: "#faad14" }} />
                      <Text style={{ fontSize: 12 }}>{injectResult.skippedDuplicate} doublon(s) ignoré(s)</Text>
                    </Space>
                  )}
                  {injectResult.skippedInvalid > 0 && (
                    <Space size={4}>
                      <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
                      <Text style={{ fontSize: 12 }}>{injectResult.skippedInvalid} invalide(s)</Text>
                    </Space>
                  )}
                  {injectResult.skippedDuplicate === 0 && injectResult.skippedInvalid === 0 && (
                    <Text style={{ fontSize: 12 }} type="secondary">Aucun doublon détecté</Text>
                  )}
                </Space>
              }
              style={{ padding: "8px 0" }}
            />
          </Card>
        )}

        {/* Barre de sélection */}
        {selectedBuf.length > 0 && (
          <Alert
            style={{ marginBottom: 12, borderRadius: 6 }}
            type="info"
            showIcon
            message={
              <Space>
                <Text>{selectedBuf.length} ligne(s) sélectionnée(s)</Text>
                <Button size="small" icon={<CheckOutlined />} onClick={() => void reviewSelected("accepted")}>
                  Accepter la sélection
                </Button>
                <Button size="small" danger icon={<CloseOutlined />} onClick={() => void reviewSelected("rejected")}>
                  Rejeter la sélection
                </Button>
              </Space>
            }
          />
        )}

        <Table
          rowKey="id"
          columns={bufCols}
          dataSource={buffer}
          loading={bufferLoading}
          size="small"
          scroll={{ x: 900 }}
          expandable={{
            rowExpandable: (r) => Boolean(r.raw.enrichment?.trim()),
            expandedRowRender: (r) => (
              <div style={{ padding: "4px 0 8px", maxWidth: 720 }}>
                <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
                  Enrichissement entreprise
                </Text>
                <Text style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {r.raw.enrichment}
                </Text>
              </div>
            ),
          }}
          rowSelection={{
            selectedRowKeys: selectedBuf,
            onChange: (k) => setSelectedBuf(k as string[]),
            getCheckboxProps: (r) => ({ disabled: r.raw.duplicate === true }),
          }}
          pagination={{
            pageSize: 25,
            showTotal: (t, range) => `${range[0]}–${range[1]} sur ${t} lead(s)`,
            showSizeChanger: false,
          }}
        />
      </Drawer>
    </div>
  );
}

export default function ScrapingPage() {
  return (
    <Suspense fallback={null}>
      <ScrapingPageInner />
    </Suspense>
  );
}
