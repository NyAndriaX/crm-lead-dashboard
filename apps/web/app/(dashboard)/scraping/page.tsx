"use client";

/**
 * Page /scraping — module Scraping (S-01 → S-10).
 *
 * Onglets :
 *  - Missions : créer/configurer/lancer une mission (S-01, S-06, S-08, S-09)
 *  - Résultats : valider les leads scrapés avant injection CRM (S-07, S-10)
 *
 * Le scraping réel tourne côté worker (adapters sandbox par défaut).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select,
  Space, Switch, Table, Tabs, Tag, Typography, message, Drawer, Statistic, Row, Col,
} from "antd";
import {
  PlayCircleOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined,
  EditOutlined, RadarChartOutlined, CheckOutlined, CloseOutlined,
  CloudDownloadOutlined, FileSearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type Source = "google_maps" | "directories" | "linkedin" | "website";
const SOURCE_LABELS: Record<Source, string> = {
  google_maps: "Google Maps / Places",
  directories: "Annuaires pro",
  linkedin: "LinkedIn",
  website: "Sites web sectoriels",
};

type Mission = {
  id: string;
  name: string;
  config: {
    sources: Source[];
    keywords: string;
    location: { city?: string | null; country?: string | null; radiusKm?: number | null };
    companyType?: string | null;
    companySize?: string | null;
    language?: string | null;
    limit: number;
    rate: { delayMs: number; retries: number; rotateUserAgent: boolean; proxyUrl?: string | null };
    dailyQuota?: number | null;
    autoPipeline?: { enabled: boolean; sequenceId?: string | null };
  };
  schedule: string | null;
  status: string;
  logs: string | null;
  createdAt: string;
  bufferCounts: { pending: number; accepted: number; rejected: number };
};

type BufferItem = {
  id: string;
  status: string;
  raw: {
    name?: string | null; company?: string | null; email?: string | null;
    phone?: string | null; website?: string | null; address?: string | null;
    city?: string | null; sector?: string | null; source?: string;
    rating?: number | null; duplicate?: boolean; duplicateReason?: string | null;
  };
  createdAt: string;
};

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: "default", label: "En attente" },
  queued: { color: "blue", label: "En file" },
  running: { color: "processing", label: "En cours" },
  done: { color: "green", label: "Terminée" },
  error: { color: "red", label: "Erreur" },
};

export default function ScrapingPage() {
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
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([]);

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
    api.get<{ data: { id: string; name: string }[] }>("/sequences")
      .then((r) => setSequences(r.data.data ?? []))
      .catch(() => setSequences([]));
  }, []);

  // Auto-refresh tant qu'une mission tourne.
  useEffect(() => {
    if (!missions.some((m) => m.status === "running" || m.status === "queued")) return;
    const t = setInterval(() => void fetchMissions(), 4000);
    return () => clearInterval(t);
  }, [missions, fetchMissions]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      sources: ["google_maps"],
      limit: 50,
      language: "fr",
      country: "France",
      delayMs: 2000,
      retries: 2,
      rotateUserAgent: true,
    });
    setFormOpen(true);
  }

  function openEdit(m: Mission) {
    setEditing(m);
    form.setFieldsValue({
      name: m.name,
      sources: m.config.sources,
      keywords: m.config.keywords,
      city: m.config.location.city,
      country: m.config.location.country,
      radiusKm: m.config.location.radiusKm,
      companyType: m.config.companyType,
      companySize: m.config.companySize,
      language: m.config.language,
      limit: m.config.limit,
      delayMs: m.config.rate.delayMs,
      retries: m.config.rate.retries,
      rotateUserAgent: m.config.rate.rotateUserAgent,
      proxyUrl: m.config.rate.proxyUrl,
      schedule: m.schedule,
      dailyQuota: m.config.dailyQuota ?? null,
      autoPipelineEnabled: m.config.autoPipeline?.enabled ?? false,
      autoPipelineSequenceId: m.config.autoPipeline?.sequenceId ?? null,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const v = await form.validateFields();
    setSaving(true);
    const body = {
      name: v.name,
      schedule: v.schedule || null,
      config: {
        sources: v.sources,
        keywords: v.keywords ?? "",
        location: { city: v.city || null, country: v.country || "France", radiusKm: v.radiusKm ?? null },
        companyType: v.companyType || null,
        companySize: v.companySize || null,
        language: v.language || "fr",
        limit: v.limit ?? 50,
        rate: {
          delayMs: v.delayMs ?? 2000,
          retries: v.retries ?? 2,
          rotateUserAgent: v.rotateUserAgent ?? true,
          proxyUrl: v.proxyUrl || null,
        },
        dailyQuota: v.dailyQuota ?? null,
        autoPipeline: {
          enabled: Boolean(v.autoPipelineEnabled),
          sequenceId: v.autoPipelineSequenceId || null,
        },
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
      await api.post(`/scraping/missions/${m.id}/run`);
      message.success("Mission lancée — résultats sous peu");
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
    try {
      const { data } = await api.post<{ data: { injected: number; skippedDuplicate: number; skippedInvalid: number } }>(
        `/scraping/missions/${resultsTarget.id}/results`,
      );
      const r = data.data;
      message.success(`${r.injected} lead(s) injecté(s) · ${r.skippedDuplicate} doublon(s) · ${r.skippedInvalid} invalide(s)`);
      void loadBuffer(resultsTarget.id);
      void fetchMissions();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Injection impossible");
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
      title: "Sources",
      key: "sources",
      render: (_, r) => (
        <Space size={2} wrap>
          {r.config.sources.map((s) => <Tag key={s}>{SOURCE_LABELS[s]}</Tag>)}
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
      title: "Résultats",
      key: "buffer",
      width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Tag>{r.bufferCounts.pending} à valider</Tag>
          <Tag color="green">{r.bufferCounts.accepted} ok</Tag>
          <Tag color="red">{r.bufferCounts.rejected} rejet</Tag>
        </Space>
      ),
    },
    {
      title: "Planif.",
      dataIndex: "schedule",
      key: "schedule",
      width: 90,
      render: (v) => v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 230,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={r.status === "running" || r.status === "queued"}
            onClick={() => void runMission(r)}
          >
            Lancer
          </Button>
          <Button size="small" icon={<FileSearchOutlined />} onClick={() => openResults(r)}>
            Résultats
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" onClick={() => setLogsTarget(r)}>Logs</Button>
          <Popconfirm title={`Supprimer "${r.name}" ?`} onConfirm={() => void removeMission(r)} okText="Supprimer" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const bufCols: ColumnsType<BufferItem> = [
    { title: "Nom", key: "name", render: (_, r) => r.raw.name || <Text type="secondary">—</Text> },
    { title: "Entreprise", key: "company", render: (_, r) => r.raw.company || "—" },
    { title: "Email", key: "email", render: (_, r) => r.raw.email || <Text type="secondary">—</Text> },
    { title: "Tél", key: "phone", render: (_, r) => r.raw.phone || "—" },
    { title: "Ville", key: "city", render: (_, r) => r.raw.city || "—" },
    { title: "Source", key: "source", width: 110, render: (_, r) => <Tag>{r.raw.source}</Tag> },
    {
      title: "Statut", key: "status", width: 130,
      render: (_, r) =>
        r.raw.duplicate
          ? <Tag color="orange">doublon</Tag>
          : r.status === "accepted"
            ? <Tag color="green">accepté</Tag>
            : r.status === "rejected"
              ? <Tag color="red">rejeté</Tag>
              : <Tag>à valider</Tag>,
    },
  ];

  return (
    <div style={{ padding: "16px 24px" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Space>
          <RadarChartOutlined style={{ fontSize: 24, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>Scraping</Title>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchMissions()}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouvelle mission</Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Mode sandbox actif par défaut"
        description="Les adapters génèrent des résultats mock réalistes (testable sans risque). Le scraping réel (Playwright + proxies, conforme CGU/robots.txt) s'active via la variable d'env SCRAPING_LIVE=true côté worker."
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
            <Input placeholder="ex. Restaurants Lyon Q2" />
          </Form.Item>
          <Form.Item name="sources" label="Sources" rules={[{ required: true, message: "Au moins une source" }]}>
            <Select
              mode="multiple"
              options={(Object.keys(SOURCE_LABELS) as Source[]).map((s) => ({ value: s, label: SOURCE_LABELS[s] }))}
            />
          </Form.Item>
          <Form.Item name="keywords" label="Mots-clés / secteur">
            <Input placeholder="ex. restaurant, traiteur, boulangerie" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="city" label="Ville"><Input placeholder="Lyon" /></Form.Item></Col>
            <Col span={8}><Form.Item name="country" label="Pays"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="radiusKm" label="Rayon (km)"><InputNumber min={0} max={2000} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="companyType" label="Type d'entreprise"><Input placeholder="PME, TPE…" /></Form.Item></Col>
            <Col span={8}><Form.Item name="companySize" label="Taille"><Input placeholder="10-50" /></Form.Item></Col>
            <Col span={8}><Form.Item name="limit" label="Limite résultats"><InputNumber min={1} max={500} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>Débit & proxy (S-06)</Paragraph>
          <Row gutter={12}>
            <Col span={6}><Form.Item name="delayMs" label="Délai (ms)"><InputNumber min={0} max={60000} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="retries" label="Retries"><InputNumber min={0} max={10} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="rotateUserAgent" label="Rotation UA" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="schedule" label="Planification"><Select allowClear placeholder="Aucune" options={[{ value: "daily", label: "Quotidien" }, { value: "weekly", label: "Hebdo" }, { value: "monthly", label: "Mensuel" }]} /></Form.Item></Col>
          </Row>
          <Form.Item name="proxyUrl" label="Proxy URL (optionnel)"><Input placeholder="http://user:pass@proxy:port" /></Form.Item>

          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
            Pipeline automatisé (F4) — scraping → injection → relances IA automatiques
          </Paragraph>
          <Row gutter={12} align="middle">
            <Col span={8}>
              <Form.Item name="dailyQuota" label="Quota / jour" tooltip="Plafond de leads scrapés par exécution (ex. 100/jour)">
                <InputNumber min={1} max={1000} style={{ width: "100%" }} placeholder="ex. 100" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="autoPipelineEnabled" label="Auto-pipeline" valuePropName="checked" tooltip="Injecte automatiquement les leads non-doublons (sans validation manuelle)">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="autoPipelineSequenceId" label="Séquence de relance IA" tooltip="Les leads injectés sont enrôlés ; les étapes avec aiPersonalize envoient des messages uniques par destinataire">
                <Select
                  allowClear
                  placeholder="Aucune (injection seule)"
                  options={sequences.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Logs */}
      <Drawer title={`Logs — ${logsTarget?.name}`} open={!!logsTarget} onClose={() => setLogsTarget(null)} width={560}>
        <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap", maxHeight: "70vh", overflow: "auto" }}>
          {logsTarget?.logs || "(aucun log)"}
        </pre>
      </Drawer>

      {/* Résultats / validation (S-10) */}
      <Drawer
        title={<Space><FileSearchOutlined /> Résultats — {resultsTarget?.name}</Space>}
        open={!!resultsTarget}
        onClose={() => setResultsTarget(null)}
        width={920}
        extra={
          <Space>
            <Button icon={<CheckOutlined />} disabled={selectedBuf.length === 0} onClick={() => void reviewSelected("accepted")}>
              Accepter ({selectedBuf.length})
            </Button>
            <Button icon={<CloseOutlined />} danger disabled={selectedBuf.length === 0} onClick={() => void reviewSelected("rejected")}>
              Rejeter
            </Button>
            <Popconfirm
              title="Injecter les leads acceptés dans le CRM ?"
              description="Re-dédoublonnage automatique avant insertion."
              onConfirm={() => void injectAccepted()}
              okText="Injecter"
            >
              <Button type="primary" icon={<CloudDownloadOutlined />}>Injecter dans le CRM</Button>
            </Popconfirm>
          </Space>
        }
      >
        {resultsTarget && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}><Statistic title="À valider" value={resultsTarget.bufferCounts.pending} /></Col>
            <Col span={8}><Statistic title="Acceptés" value={resultsTarget.bufferCounts.accepted} valueStyle={{ color: "#52c41a" }} /></Col>
            <Col span={8}><Statistic title="Rejetés" value={resultsTarget.bufferCounts.rejected} valueStyle={{ color: "#ff4d4f" }} /></Col>
          </Row>
        )}
        <Table
          rowKey="id"
          columns={bufCols}
          dataSource={buffer}
          loading={bufferLoading}
          size="small"
          scroll={{ x: 900 }}
          rowSelection={{ selectedRowKeys: selectedBuf, onChange: (k) => setSelectedBuf(k as string[]) }}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} ligne(s)` }}
        />
      </Drawer>
    </div>
  );
}
