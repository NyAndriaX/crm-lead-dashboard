"use client";

/**
 * Tableau de bord Administrateur — CRM-071.
 * Tabs : Vue d'ensemble · Utilisateurs · Scoring · Imports récents
 */
import { useCallback, useEffect, useState } from "react";
import {
  Tabs, Card, Typography, Table, Button, Tag, Space, Form, InputNumber, Row, Col,
  Statistic, Badge, Modal, Input, Select, message, Spin, Alert, Popconfirm,
  Descriptions, List, Progress,
} from "antd";
import {
  UserOutlined, TeamOutlined, TrophyOutlined, UploadOutlined, PlusOutlined,
  EditOutlined, StopOutlined, CheckOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import type { ScoringWeightsInput } from "@/lib/schemas/import";

const { Title, Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  leads: { total: number; active: number; newToday: number; newThisWeek: number; newThisMonth: number };
  byStatus: Record<string, number>;
  users: { total: number; active: number };
  recentImports: ImportJobLite[];
}

interface ImportJobLite {
  id: string; fileName: string; status: string;
  importedRows: number; totalRows: number; createdAt: string;
  user?: { name: string };
}

interface UserRow {
  id: string; name: string; email: string; role: string;
  isActive: boolean; lastLoginAt: string | null; createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", COMMERCIAL: "Commercial", LECTEUR: "Lecteur",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "red", MANAGER: "orange", COMMERCIAL: "blue", LECTEUR: "default",
};

// ── Onglet Vue d'ensemble ────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<{ data: Stats }>("/admin/stats")
      .then((r) => setStats(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin />;
  if (error) return <Alert type="error" message="Impossible de charger les statistiques (rôle Admin/Manager requis)" />;
  if (!stats) return null;

  const statusOrder = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={4}>
          <Card><Statistic title="Total leads" value={stats.leads.total} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card><Statistic title="Leads actifs" value={stats.leads.active} valueStyle={{ color: "#1677ff" }} /></Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card><Statistic title="Aujourd'hui" value={stats.leads.newToday} valueStyle={{ color: "#52c41a" }} /></Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card><Statistic title="Cette semaine" value={stats.leads.newThisWeek} /></Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card><Statistic title="Ce mois" value={stats.leads.newThisMonth} /></Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card>
            <Statistic title="Utilisateurs actifs" value={stats.users.active} suffix={`/ ${stats.users.total}`} prefix={<UserOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Leads par statut">
            <Space direction="vertical" style={{ width: "100%" }}>
              {statusOrder.map((s) => {
                const count = stats.byStatus[s] ?? 0;
                const pct = stats.leads.total > 0 ? Math.round((count / stats.leads.total) * 100) : 0;
                return (
                  <div key={s}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Tag color={STATUS_COLORS[s as keyof typeof STATUS_COLORS]}>{STATUS_LABELS[s as keyof typeof STATUS_LABELS]}</Tag>
                      <Text>{count} ({pct}%)</Text>
                    </div>
                    <Progress percent={pct} showInfo={false} strokeColor={STATUS_COLORS[s as keyof typeof STATUS_COLORS]} size="small" />
                  </div>
                );
              })}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Imports récents">
            {stats.recentImports.length === 0 && <Text type="secondary">Aucun import</Text>}
            <List
              size="small"
              dataSource={stats.recentImports}
              renderItem={(job) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Text ellipsis>{job.fileName}</Text>}
                    description={
                      <Space>
                        <Badge
                          status={job.status === "done" ? "success" : job.status === "failed" ? "error" : "processing"}
                          text={job.status}
                        />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {job.importedRows}/{job.totalRows} · {new Date(job.createdAt).toLocaleDateString("fr-FR")}
                        </Text>
                      </Space>
                    }
                  />
                  {job.user && <Text type="secondary" style={{ fontSize: 11 }}>{job.user.name}</Text>}
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

// ── Onglet Utilisateurs ──────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: UserRow[] }>("/users?all=true");
      setUsers(data.data);
    } catch { message.error("Impossible de charger les utilisateurs."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  async function createUser() {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await api.post("/users", values);
      message.success("Utilisateur créé");
      createForm.resetFields();
      setCreateOpen(false);
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editUser) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await api.put(`/users/${editUser.id}`, values);
      message.success("Utilisateur mis à jour");
      setEditUser(null);
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function toggleActive(user: UserRow) {
    try {
      if (user.isActive) {
        await api.delete(`/users/${user.id}`);
        message.success("Utilisateur désactivé");
      } else {
        await api.put(`/users/${user.id}`, { isActive: true });
        message.success("Utilisateur réactivé");
      }
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  const columns: ColumnsType<UserRow> = [
    { title: "Nom", dataIndex: "name", key: "name", render: (v, r) => <Space><UserOutlined />{v}{!r.isActive && <Tag color="default">Inactif</Tag>}</Space> },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Rôle", dataIndex: "role", key: "role", render: (v: string) => <Tag color={ROLE_COLORS[v]}>{ROLE_LABELS[v]}</Tag> },
    { title: "Dernière connexion", dataIndex: "lastLoginAt", key: "lastLoginAt", render: (v) => v ? new Date(v).toLocaleString("fr-FR") : "Jamais" },
    { title: "Créé le", dataIndex: "createdAt", key: "createdAt", render: (v) => new Date(v).toLocaleDateString("fr-FR") },
    {
      title: "Actions", key: "actions", width: 120,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditUser(r); editForm.setFieldsValue({ name: r.name, role: r.role }); }} />
          <Popconfirm
            title={r.isActive ? "Désactiver cet utilisateur ?" : "Réactiver cet utilisateur ?"}
            onConfirm={() => void toggleActive(r)}
          >
            <Button size="small" danger={r.isActive} icon={r.isActive ? <StopOutlined /> : <CheckOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Text strong>{users.length} utilisateur(s)</Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Nouvel utilisateur</Button>
        </Space>
      </div>

      <Table rowKey="id" columns={columns} dataSource={users} loading={loading} size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `${t} utilisateur(s)` }} />

      {/* Modale création */}
      <Modal title="Nouvel utilisateur" open={createOpen} onOk={() => void createUser()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={saving} okText="Créer" cancelText="Annuler">
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true }]}>
            <Input placeholder="Jean Dupont" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input placeholder="jean@exemple.com" />
          </Form.Item>
          <Form.Item name="password" label="Mot de passe" rules={[{ required: true, min: 8, message: "8 caractères minimum" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Rôle" initialValue="COMMERCIAL">
            <Select options={Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modale édition */}
      <Modal title="Modifier l'utilisateur" open={!!editUser} onOk={() => void saveEdit()}
        onCancel={() => setEditUser(null)} confirmLoading={saving} okText="Enregistrer" cancelText="Annuler">
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Rôle">
            <Select options={Object.entries(ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

// ── Onglet Scoring ───────────────────────────────────────────────────────────

const WEIGHT_LABELS: Record<string, string> = {
  hasEmail: "Email renseigné", hasPhone: "Téléphone renseigné", hasCompany: "Entreprise renseignée",
  hasWebsite: "Site web renseigné", hasSector: "Secteur renseigné", hasLocation: "Localisation (ville/pays)",
  enriched: "Enrichissement présent", perOpen: "Par email ouvert", maxOpens: "Plafond ouvertures",
  perClick: "Par clic", maxClicks: "Plafond clics", replied: "A répondu",
};

const BONUS_LABELS: Record<string, string> = {
  CONTACTE: "Contacté", QUALIFIE: "Qualifié", EN_DISCUSSION: "En discussion",
  CONVERTI: "Converti", PERDU: "Perdu (malus)",
};

function ScoringTab() {
  const [form] = Form.useForm<ScoringWeightsInput>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<{ data: ScoringWeightsInput }>("/admin/scoring-weights")
      .then((r) => form.setFieldsValue(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [form]);

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.put("/admin/scoring-weights", values);
      message.success("Poids de scoring enregistrés");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  if (loading) return <Spin />;
  if (error) return <Alert type="error" message="Impossible de charger la configuration (rôle Admin requis)" />;

  return (
    <Form form={form} layout="vertical">
      <Alert
        type="info"
        message="Ces poids définissent comment le score 0–100 de chaque lead est calculé."
        style={{ marginBottom: 24 }}
        showIcon
      />

      <Card title="Complétude du profil (points par champ)" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          {["hasEmail", "hasPhone", "hasCompany", "hasWebsite", "hasSector", "hasLocation", "enriched"].map((k) => (
            <Col key={k} xs={12} sm={8} md={6}>
              <Form.Item name={k} label={WEIGHT_LABELS[k]} rules={[{ required: true, type: "number", min: 0, max: 100 }]}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} addonAfter="pts" />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Signaux email" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]}>
          {["perOpen", "maxOpens", "perClick", "maxClicks", "replied"].map((k) => (
            <Col key={k} xs={12} sm={8} md={6}>
              <Form.Item name={k} label={WEIGHT_LABELS[k]} rules={[{ required: true, type: "number", min: 0, max: 100 }]}>
                <InputNumber min={0} max={100} style={{ width: "100%" }} addonAfter="pts" />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Bonus / malus par statut commercial" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 8]}>
          {Object.entries(BONUS_LABELS).map(([k, label]) => (
            <Col key={k} xs={12} sm={8} md={4}>
              <Form.Item name={["statusBonus", k]} label={label} rules={[{ required: true, type: "number", min: -50, max: 50 }]}>
                <InputNumber min={-50} max={50} style={{ width: "100%" }} addonAfter="pts" />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Card>

      <Button type="primary" onClick={() => void save()} loading={saving} size="large">
        Enregistrer les poids
      </Button>
    </Form>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>Administration</Title>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: "overview",
            label: <Space><TrophyOutlined />Vue d&apos;ensemble</Space>,
            children: <OverviewTab />,
          },
          {
            key: "users",
            label: <Space><UserOutlined />Utilisateurs</Space>,
            children: <UsersTab />,
          },
          {
            key: "scoring",
            label: <Space><TrophyOutlined />Scoring</Space>,
            children: <ScoringTab />,
          },
          {
            key: "imports",
            label: <Space><UploadOutlined />Imports</Space>,
            children: (
              <Alert
                type="info"
                showIcon
                message="Consultez la page Import"
                description={
                  <span>
                    L&apos;historique complet des imports est disponible sur la{" "}
                    <a href="/import">page Import</a>.
                  </span>
                }
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
