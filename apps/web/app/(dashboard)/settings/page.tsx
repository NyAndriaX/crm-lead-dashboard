"use client";

/**
 * Page Administration — CRM-071.
 * Tabs : Vue d'ensemble · Utilisateurs · Scoring · Imports
 */
import { useCallback, useEffect, useState } from "react";
import {
  Tabs, Card, Typography, Table, Button, Tag, Space, Form, InputNumber, Row, Col,
  Statistic, Badge, Modal, Input, Select, message, Spin, Alert, Popconfirm, List,
  Progress, Divider, Avatar, Switch, Tooltip,
} from "antd";
import {
  UserOutlined, TrophyOutlined, UploadOutlined, PlusOutlined, EditOutlined,
  StopOutlined, CheckOutlined, ReloadOutlined, SafetyOutlined, FireOutlined,
  TeamOutlined, CalendarOutlined, SettingOutlined, LockOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import type { ScoringWeightsInput } from "@/lib/schemas/import";

const { Title, Text, Paragraph } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminStats {
  leads: { total: number; active: number; newToday: number; newThisWeek: number; newThisMonth: number };
  byStatus: Record<string, number>;
  users: { total: number; active: number };
  recentImports: { id: string; fileName: string; status: string; importedRows: number; totalRows: number; createdAt: string; user?: { name: string } }[];
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
const ROLE_BG: Record<string, string> = {
  ADMIN: "#fff1f0", MANAGER: "#fff7e6", COMMERCIAL: "#e6f4ff", LECTEUR: "#fafafa",
};

// ── Onglet Vue d'ensemble ────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<{ data: AdminStats }>("/admin/stats")
      .then((r) => setStats(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin size="large" /></div>;
  if (error) return <Alert type="warning" message="Statistiques réservées aux rôles Admin et Manager." showIcon style={{ marginBottom: 16 }} />;
  if (!stats) return null;

  const statusOrder = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"];
  const STATUS_HEX: Record<string, string> = {
    NOUVEAU: "#8c8c8c", CONTACTE: "#1677ff", QUALIFIE: "#13c2c2",
    EN_DISCUSSION: "#faad14", CONVERTI: "#52c41a", PERDU: "#ff4d4f",
  };

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      {/* ── KPI row ── */}
      <Row gutter={[16, 16]}>
        {[
          { label: "Total leads", value: stats.leads.total, color: "#1677ff", icon: <TeamOutlined />, sub: `${stats.leads.active} actifs` },
          { label: "Nouveaux aujourd'hui", value: stats.leads.newToday, color: "#13c2c2", icon: <CalendarOutlined />, sub: `${stats.leads.newThisWeek} cette semaine` },
          { label: "Ce mois", value: stats.leads.newThisMonth, color: "#722ed1", icon: <FireOutlined />, sub: "leads créés" },
          { label: "Utilisateurs actifs", value: stats.users.active, color: "#52c41a", icon: <UserOutlined />, sub: `/ ${stats.users.total} comptes` },
        ].map(({ label, value, color, icon, sub }) => (
          <Col xs={12} xl={6} key={label}>
            <Card bodyStyle={{ padding: "20px 24px" }} style={{ borderTop: `3px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Text>
                  <div><span style={{ fontSize: 26, fontWeight: 700, color }}>{value}</span></div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color }}>
                  {icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Pipeline + Imports ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title={<Space><TeamOutlined style={{ color: "#1677ff" }} /><span>Pipeline par statut</span></Space>}>
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {statusOrder.map((s) => {
                const count = stats.byStatus[s] ?? 0;
                const pct = stats.leads.total > 0 ? Math.round((count / stats.leads.total) * 100) : 0;
                return (
                  <div key={s}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Space size={6}>
                        <Badge color={STATUS_HEX[s]} />
                        <Tag color={STATUS_COLORS[s as keyof typeof STATUS_COLORS]} style={{ margin: 0, fontSize: 12 }}>
                          {STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
                        </Tag>
                      </Space>
                      <Space size={8}>
                        <Text strong>{count}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{pct}%</Text>
                      </Space>
                    </div>
                    <Progress percent={pct} showInfo={false} strokeColor={STATUS_HEX[s]} size="small" trailColor="#f5f5f5" />
                  </div>
                );
              })}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card
            title={<Space><UploadOutlined style={{ color: "#1677ff" }} /><span>Imports récents</span></Space>}
            extra={<Button size="small" type="link" href="/import">Voir tout →</Button>}
            style={{ height: "100%" }}
          >
            {stats.recentImports.length === 0
              ? <Text type="secondary">Aucun import pour l&apos;instant.</Text>
              : <List
                  size="small"
                  dataSource={stats.recentImports}
                  renderItem={(job) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text ellipsis style={{ maxWidth: 160 }}>{job.fileName}</Text>}
                        description={
                          <Space direction="vertical" size={0}>
                            <Badge
                              status={job.status === "done" ? "success" : job.status === "failed" ? "error" : "processing"}
                              text={<Text style={{ fontSize: 11 }}>{job.status}</Text>}
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
            }
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
      message.success("Utilisateur créé avec succès");
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
        message.success("Compte désactivé");
      } else {
        await api.put(`/users/${user.id}`, { isActive: true });
        message.success("Compte réactivé");
      }
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  const columns: ColumnsType<UserRow> = [
    {
      title: "Utilisateur", key: "user",
      render: (_, r) => (
        <Space>
          <Avatar
            size={36}
            style={{
              background: ROLE_BG[r.role],
              color: ROLE_COLORS[r.role] === "default" ? "#595959" : `var(--ant-color-${ROLE_COLORS[r.role]})`,
              border: `1px solid ${ROLE_COLORS[r.role] === "default" ? "#d9d9d9" : "transparent"}`,
              fontSize: 12, fontWeight: 600,
            }}
          >
            {r.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
          </Avatar>
          <div>
            <Text strong style={{ display: "block" }}>{r.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Rôle", dataIndex: "role", key: "role", width: 130,
      render: (v: string) => (
        <Tag color={ROLE_COLORS[v]} style={{ fontWeight: 500 }}>{ROLE_LABELS[v]}</Tag>
      ),
    },
    {
      title: "Statut", dataIndex: "isActive", key: "isActive", width: 100,
      render: (v: boolean) => v
        ? <Badge status="success" text={<Text style={{ fontSize: 12, color: "#52c41a" }}>Actif</Text>} />
        : <Badge status="error" text={<Text style={{ fontSize: 12, color: "#ff4d4f" }}>Inactif</Text>} />,
    },
    {
      title: "Dernière connexion", dataIndex: "lastLoginAt", key: "lastLoginAt", width: 170,
      render: (v) => v
        ? new Date(v).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : <Text type="secondary">Jamais connecté</Text>,
    },
    {
      title: "Membre depuis", dataIndex: "createdAt", key: "createdAt", width: 130,
      render: (v) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }),
    },
    {
      title: "", key: "actions", width: 90,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Modifier">
            <Button
              size="small" icon={<EditOutlined />}
              onClick={() => { setEditUser(r); editForm.setFieldsValue({ name: r.name, role: r.role }); }}
            />
          </Tooltip>
          <Tooltip title={r.isActive ? "Désactiver" : "Réactiver"}>
            <Popconfirm
              title={r.isActive ? `Désactiver ${r.name} ?` : `Réactiver ${r.name} ?`}
              onConfirm={() => void toggleActive(r)}
              okText="Confirmer" cancelText="Annuler"
            >
              <Button
                size="small"
                danger={r.isActive}
                icon={r.isActive ? <StopOutlined /> : <CheckOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Stats rapides */}
      <Row gutter={12}>
        {[
          { label: "Total", value: users.length, color: "#1677ff" },
          { label: "Actifs", value: activeCount, color: "#52c41a" },
          { label: "Inactifs", value: users.length - activeCount, color: "#ff4d4f" },
        ].map(({ label, value, color }) => (
          <Col key={label}>
            <Card size="small" bodyStyle={{ padding: "12px 20px" }}>
              <Statistic title={<Text style={{ fontSize: 12 }}>{label}</Text>} value={value} valueStyle={{ fontSize: 20, color }} />
            </Card>
          </Col>
        ))}
        <Col flex="auto" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Nouvel utilisateur
          </Button>
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        size="middle"
        pagination={{ pageSize: 15, showTotal: (t) => `${t} utilisateur(s)` }}
        rowClassName={(r) => (!r.isActive ? "opacity-50" : "")}
      />

      {/* Modale création */}
      <Modal
        title={<Space><UserOutlined /><span>Nouvel utilisateur</span></Space>}
        open={createOpen}
        onOk={() => void createUser()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={saving}
        okText="Créer le compte"
        cancelText="Annuler"
        width={480}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true, message: "Champ requis" }]}>
            <Input prefix={<UserOutlined />} placeholder="Jean Dupont" />
          </Form.Item>
          <Form.Item name="email" label="Adresse email" rules={[{ required: true, type: "email", message: "Email invalide" }]}>
            <Input prefix="@" placeholder="jean@exemple.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mot de passe"
            rules={[{ required: true, min: 8, message: "8 caractères minimum" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="8 caractères minimum" />
          </Form.Item>
          <Form.Item name="role" label="Rôle" initialValue="COMMERCIAL">
            <Select
              options={Object.entries(ROLE_LABELS).map(([v, l]) => ({
                value: v,
                label: <Space><Tag color={ROLE_COLORS[v]}>{l}</Tag></Space>,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modale édition */}
      <Modal
        title={<Space><EditOutlined /><span>Modifier {editUser?.name}</span></Space>}
        open={!!editUser}
        onOk={() => void saveEdit()}
        onCancel={() => setEditUser(null)}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
        width={400}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom complet" rules={[{ required: true }]}>
            <Input prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="role" label="Rôle">
            <Select
              options={Object.entries(ROLE_LABELS).map(([v, l]) => ({
                value: v,
                label: <Space><Tag color={ROLE_COLORS[v]}>{l}</Tag></Space>,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

// ── Onglet Scoring ───────────────────────────────────────────────────────────

const WEIGHT_GROUPS = [
  {
    title: "Complétude du profil",
    icon: <UserOutlined />,
    color: "#1677ff",
    fields: [
      { key: "hasEmail", label: "Email renseigné", max: 30 },
      { key: "hasPhone", label: "Téléphone renseigné", max: 30 },
      { key: "hasCompany", label: "Entreprise renseignée", max: 30 },
      { key: "hasWebsite", label: "Site web renseigné", max: 20 },
      { key: "hasSector", label: "Secteur renseigné", max: 20 },
      { key: "hasLocation", label: "Localisation (ville/pays)", max: 20 },
      { key: "enriched", label: "Enrichissement présent", max: 20 },
    ],
  },
  {
    title: "Signaux email",
    icon: <UploadOutlined />,
    color: "#13c2c2",
    fields: [
      { key: "perOpen", label: "Points par email ouvert", max: 20 },
      { key: "maxOpens", label: "Plafond ouvertures", max: 50 },
      { key: "perClick", label: "Points par clic", max: 20 },
      { key: "maxClicks", label: "Plafond clics", max: 50 },
      { key: "replied", label: "A répondu (points)", max: 50 },
    ],
  },
  {
    title: "Bonus / malus par statut",
    icon: <TrophyOutlined />,
    color: "#52c41a",
    fields: [
      { key: ["statusBonus", "CONTACTE"] as [string, string], label: "Contacté", max: 30 },
      { key: ["statusBonus", "QUALIFIE"] as [string, string], label: "Qualifié", max: 30 },
      { key: ["statusBonus", "EN_DISCUSSION"] as [string, string], label: "En discussion", max: 30 },
      { key: ["statusBonus", "CONVERTI"] as [string, string], label: "Converti", max: 50 },
      { key: ["statusBonus", "PERDU"] as [string, string], label: "Perdu (malus négatif)", max: 30 },
    ],
  },
];

function ScoringTab() {
  const [form] = Form.useForm<ScoringWeightsInput>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

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
      setSaved(true);
      message.success("Poids de scoring mis à jour ✓");
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin size="large" /></div>;
  if (error) return <Alert type="error" message="Impossible de charger les poids. Rôle Admin requis." showIcon />;

  return (
    <Form form={form} layout="vertical">
      <Alert
        type="info"
        showIcon
        icon={<FireOutlined />}
        message="Ces poids définissent le calcul du score 0–100 de chaque lead."
        description="Le score est recalculé automatiquement à chaque modification du lead. Les changements s'appliquent aux recalculs futurs."
        style={{ marginBottom: 24 }}
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {WEIGHT_GROUPS.map((group) => (
          <Card
            key={group.title}
            title={
              <Space>
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: group.color + "18",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: group.color, fontSize: 14,
                  }}
                >
                  {group.icon}
                </div>
                <span style={{ color: group.color }}>{group.title}</span>
              </Space>
            }
          >
            <Row gutter={[16, 8]}>
              {group.fields.map(({ key, label, max }) => (
                <Col key={Array.isArray(key) ? key.join(".") : key} xs={24} sm={12} md={8} lg={6}>
                  <Form.Item
                    name={key}
                    label={
                      <Text style={{ fontSize: 12 }}>{label}</Text>
                    }
                    rules={[{ required: true, type: "number", min: -50, max }]}
                  >
                    <InputNumber
                      min={-50} max={max}
                      style={{ width: "100%" }}
                      addonAfter={<span style={{ color: group.color, fontWeight: 600 }}>pts</span>}
                    />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </Card>
        ))}
      </Space>

      <Divider />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <Button onClick={() => form.resetFields()} disabled={saving}>Annuler les modifications</Button>
        <Button
          type="primary"
          onClick={() => void save()}
          loading={saving}
          icon={saved ? <CheckOutlined /> : <SafetyOutlined />}
          style={saved ? { background: "#52c41a", borderColor: "#52c41a" } : {}}
          size="large"
        >
          {saved ? "Enregistré !" : "Enregistrer les poids"}
        </Button>
      </div>
    </Form>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      {/* En-tête */}
      <div
        style={{
          background: "linear-gradient(135deg,#722ed1 0%,#531dab 100%)",
          borderRadius: 16, padding: "24px 32px",
          display: "flex", alignItems: "center", gap: 16,
        }}
      >
        <div
          style={{
            width: 52, height: 52, borderRadius: 14,
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, color: "#fff",
          }}
        >
          <SettingOutlined />
        </div>
        <div>
          <Title level={3} style={{ color: "#fff", margin: 0 }}>Administration</Title>
          <Text style={{ color: "rgba(255,255,255,0.75)" }}>
            Gestion des utilisateurs, configuration du scoring et supervision globale
          </Text>
        </div>
      </div>

      <Tabs
        defaultActiveKey="overview"
        size="large"
        items={[
          {
            key: "overview",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1677ff" }} />
                Vue d&apos;ensemble
              </Space>
            ),
            children: <OverviewTab />,
          },
          {
            key: "users",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#52c41a" }} />
                Utilisateurs
              </Space>
            ),
            children: <UsersTab />,
          },
          {
            key: "scoring",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fa8c16" }} />
                Scoring
              </Space>
            ),
            children: <ScoringTab />,
          },
          {
            key: "imports",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#722ed1" }} />
                Imports
              </Space>
            ),
            children: (
              <Card>
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <UploadOutlined style={{ fontSize: 48, color: "#722ed1", marginBottom: 16 }} />
                  <Title level={4}>Historique des imports</Title>
                  <Paragraph type="secondary">
                    L&apos;historique complet et la gestion des imports se trouvent sur la page dédiée.
                  </Paragraph>
                  <Button type="primary" href="/import" size="large" icon={<UploadOutlined />}>
                    Accéder à la page Import
                  </Button>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
