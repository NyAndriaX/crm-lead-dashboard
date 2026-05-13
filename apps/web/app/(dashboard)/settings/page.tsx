"use client";

/**
 * Page Administration — CRM-071.
 * Tabs : Vue d'ensemble · Utilisateurs · Scoring · Imports
 */
import { useCallback, useEffect, useState } from "react";
import {
  Tabs, Card, Typography, Table, Button, Tag, Space, Form, InputNumber, Row, Col,
  Statistic, Badge, Modal, Input, Select, message, Spin, Alert, Popconfirm, List,
  Progress, Divider, Avatar, Tooltip, Checkbox,
} from "antd";
import {
  UserOutlined, TrophyOutlined, UploadOutlined, PlusOutlined, EditOutlined,
  StopOutlined, CheckOutlined, ReloadOutlined, SafetyOutlined, FireOutlined,
  TeamOutlined, CalendarOutlined, SettingOutlined, LockOutlined, DeleteOutlined,
  MailOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import type { ScoringWeightsInput } from "@/lib/schemas/import";
import { useIsMobile } from "@/lib/responsive";

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

interface SmtpConfigRow {
  id: string;
  label: string;
  host: string;
  port: number;
  fromName?: string | null;
  fromEmail?: string | null;
  dailyLimit: number;
  isActive: boolean;
  createdAt: string;
}

interface SmtpFormValues {
  label: string;
  host: string;
  port: number;
  login?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
  dailyLimit: number;
  isActive: boolean;
}

interface TemplateRow {
  id: string;
  name: string;
  category?: string | null;
  subject: string;
  bodyHtml: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

interface TemplateFormValues {
  name: string;
  category?: string;
  subject: string;
  bodyHtml: string;
  variables: string;
}

interface DnsRecordCheckResult {
  found: boolean;
  record?: string;
  error?: string;
}

interface SmtpDnsCheckResult {
  domain: string;
  selector?: string;
  spf: DnsRecordCheckResult;
  dkim: DnsRecordCheckResult;
  dmarc: DnsRecordCheckResult;
}

const DEFAULT_SMTP_DAILY_LIMIT = 200;

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
          <Col xs={24} sm={12} xl={6} key={label}>
            <Card bodyStyle={{ padding: "16px 18px" }} style={{ borderTop: `3px solid ${color}` }}>
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
      title: "Rôle", dataIndex: "role", key: "role", width: 130, responsive: ["sm"],
      render: (v: string) => (
        <Tag color={ROLE_COLORS[v]} style={{ fontWeight: 500 }}>{ROLE_LABELS[v]}</Tag>
      ),
    },
    {
      title: "Statut", dataIndex: "isActive", key: "isActive", width: 100, responsive: ["md"],
      render: (v: boolean) => v
        ? <Badge status="success" text={<Text style={{ fontSize: 12, color: "#52c41a" }}>Actif</Text>} />
        : <Badge status="error" text={<Text style={{ fontSize: 12, color: "#ff4d4f" }}>Inactif</Text>} />,
    },
    {
      title: "Dernière connexion", dataIndex: "lastLoginAt", key: "lastLoginAt", width: 170, responsive: ["lg"],
      render: (v) => v
        ? new Date(v).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : <Text type="secondary">Jamais connecté</Text>,
    },
    {
      title: "Membre depuis", dataIndex: "createdAt", key: "createdAt", width: 130, responsive: ["xl"],
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

      <div className="page-table-wrap">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          size="middle"
          scroll={{ x: 960 }}
          pagination={{ pageSize: 15, showTotal: (t) => `${t} utilisateur(s)` }}
          rowClassName={(r) => (!r.isActive ? "opacity-50" : "")}
        />
      </div>

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

function EmailingTab() {
  const [configs, setConfigs] = useState<SmtpConfigRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsSelector, setDnsSelector] = useState("");
  const [dnsResult, setDnsResult] = useState<SmtpDnsCheckResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SmtpConfigRow | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [form] = Form.useForm<SmtpFormValues>();
  const [templateForm] = Form.useForm<TemplateFormValues>();

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: SmtpConfigRow[] }>('/smtp-configs');
      setConfigs(data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Impossible de charger les configs SMTP.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const { data } = await api.get<{ data: TemplateRow[] }>('/templates');
      setTemplates(data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Impossible de charger les templates email.';
      message.error(msg);
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfigs(); void fetchTemplates(); }, [fetchConfigs, fetchTemplates]);

  function openCreate() {
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({ dailyLimit: DEFAULT_SMTP_DAILY_LIMIT, isActive: true });
    setModalOpen(true);
  }

  function openEdit(config: SmtpConfigRow) {
    setEditingConfig(config);
    form.setFieldsValue({
      label: config.label,
      host: config.host,
      port: config.port,
      login: undefined,
      password: undefined,
      fromName: config.fromName ?? undefined,
      fromEmail: config.fromEmail ?? undefined,
      dailyLimit: config.dailyLimit,
      isActive: config.isActive,
    });
    setModalOpen(true);
  }

  async function saveConfig() {
    const values = await form.validateFields();
    if (!editingConfig && (!values.login || !values.password)) {
      message.error('Login et mot de passe sont requis pour créer un compte SMTP.');
      return;
    }
    if (editingConfig) {
      if (values.login === "") delete values.login;
      if (values.password === "") delete values.password;
    }

    setSaving(true);
    try {
      if (editingConfig) {
        await api.put(`/smtp-configs/${editingConfig.id}`, values);
        message.success('Configuration SMTP mise à jour');
      } else {
        await api.post('/smtp-configs', values);
        message.success('Configuration SMTP créée');
      }
      setModalOpen(false);
      void fetchConfigs();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de l’enregistrement';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function deleteConfig(config: SmtpConfigRow) {
    try {
      await api.delete(`/smtp-configs/${config.id}`);
      message.success('Configuration SMTP supprimée');
      void fetchConfigs();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de la suppression';
      message.error(msg);
    }
  }

  async function testConnection() {
    try {
      const values = await form.validateFields(['host', 'port', 'login', 'password']);
      setTesting(true);
      await api.post('/smtp-configs/test', {
        host: values.host,
        port: values.port,
        login: values.login,
        password: values.password,
      });
      message.success('Connexion SMTP réussie');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur de connexion SMTP';
      message.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function openTemplateCreate() {
    setEditingTemplate(null);
    templateForm.resetFields();
    templateForm.setFieldsValue({ variables: '' });
    setTemplateModalOpen(true);
  }

  async function openTemplateEdit(template: TemplateRow) {
    setEditingTemplate(template);
    templateForm.setFieldsValue({
      name: template.name,
      category: template.category ?? undefined,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      variables: template.variables.join(', '),
    });
    setTemplateModalOpen(true);
  }

  async function saveTemplate() {
    const values = await templateForm.validateFields();
    const payload = {
      name: values.name,
      category: values.category?.trim() || undefined,
      subject: values.subject,
      bodyHtml: values.bodyHtml,
      variables: (values.variables ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, payload);
        message.success('Template mis à jour');
      } else {
        await api.post('/templates', payload);
        message.success('Template créé');
      }
      setTemplateModalOpen(false);
      void fetchTemplates();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de l’enregistrement du template';
      message.error(msg);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deleteTemplate(template: TemplateRow) {
    try {
      await api.delete(`/templates/${template.id}`);
      message.success('Template supprimé');
      void fetchTemplates();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de la suppression du template';
      message.error(msg);
    }
  }

  async function checkDnsRecords() {
    if (!dnsDomain.trim()) {
      message.error('Veuillez saisir un domaine pour la vérification DNS.');
      return;
    }
    setDnsChecking(true);
    try {
      const { data } = await api.post<{ data: SmtpDnsCheckResult }>('/smtp-configs/dns', {
        domain: dnsDomain.trim(),
        dkimSelector: dnsSelector.trim() || undefined,
      });
      setDnsResult(data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de la vérification DNS';
      message.error(msg);
    } finally {
      setDnsChecking(false);
    }
  }

  const columns: ColumnsType<SmtpConfigRow> = [
    { title: 'Nom', dataIndex: 'label', key: 'label', ellipsis: true },
    { title: 'Serveur', dataIndex: 'host', key: 'host', ellipsis: true },
    { title: 'Port', dataIndex: 'port', key: 'port', width: 90 },
    { title: 'Expéditeur', key: 'from', render: (_, row) => row.fromEmail ? `${row.fromName ?? ''} <${row.fromEmail}>` : '—' },
    { title: 'Quota / jour', dataIndex: 'dailyLimit', key: 'dailyLimit', width: 140 },
    {
      title: 'Actif', dataIndex: 'isActive', key: 'isActive', width: 100,
      render: (value: boolean) => value
        ? <Tag color="success">Oui</Tag>
        : <Tag color="default">Non</Tag>,
    },
    {
      title: '', key: 'actions', width: 140,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>Modifier</Button>
          <Popconfirm
            title={`Supprimer ${row.label} ?`}
            onConfirm={() => void deleteConfig(row)}
            okText="Supprimer"
            cancelText="Annuler"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const templateColumns: ColumnsType<TemplateRow> = [
    { title: 'Nom', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Catégorie', dataIndex: 'category', key: 'category', ellipsis: true },
    { title: 'Sujet', dataIndex: 'subject', key: 'subject', ellipsis: true },
    {
      title: 'Variables', dataIndex: 'variables', key: 'variables', ellipsis: true,
      render: (value: string[]) => value.length > 0 ? value.join(', ') : 'Aucune',
    },
    {
      title: 'Mis à jour', dataIndex: 'updatedAt', key: 'updatedAt', width: 150,
      render: (value: string) => new Date(value).toLocaleDateString('fr-FR'),
    },
    {
      title: '', key: 'actions', width: 150,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => void openTemplateEdit(row)}>Modifier</Button>
          <Popconfirm
            title={`Supprimer ${row.name} ?`}
            onConfirm={() => void deleteTemplate(row)}
            okText="Supprimer"
            cancelText="Annuler"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Row gutter={[16, 16]} align="middle" justify="space-between">
        <Col>
          <Space direction="vertical" size={4}>
            <Text strong style={{ fontSize: 18 }}>Configuration SMTP</Text>
            <Text type="secondary">Gérez les comptes SMTP chiffrés utilisés pour l’envoi de campagnes.</Text>
          </Space>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Ajouter un compte SMTP
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={configs}
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => `${total} compte(s)` }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card title="Vérification DNS SPF / DKIM / DMARC" style={{ width: '100%' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Text type="secondary">
            Vérifiez que votre domaine est correctement configuré avant l’envoi d’emails.
            SPF et DMARC doivent être présents sur le domaine principal, DKIM sur le sélecteur spécifié.
          </Text>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={10}>
              <Form.Item label="Domaine" style={{ marginBottom: 0 }}>
                <Input
                  value={dnsDomain}
                  onChange={(event) => setDnsDomain(event.target.value)}
                  placeholder="example.com"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item label="Sélecteur DKIM" style={{ marginBottom: 0 }}>
                <Input
                  value={dnsSelector}
                  onChange={(event) => setDnsSelector(event.target.value)}
                  placeholder="default"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={4}>
              <Button type="primary" loading={dnsChecking} onClick={() => void checkDnsRecords()} block>
                Vérifier
              </Button>
            </Col>
          </Row>

          {!dnsResult ? null : (
            <Card size="small" style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Text strong>Résultats pour {dnsResult.domain}</Text>
                <Row gutter={[16, 16]}>
                  {[
                    { label: 'SPF', result: dnsResult.spf, help: 'Enregistrement TXT v=spf1 sur @' },
                    { label: 'DKIM', result: dnsResult.dkim, help: `Enregistrement TXT v=DKIM1 sur ${dnsResult.selector ?? 'selector'}._domainkey` },
                    { label: 'DMARC', result: dnsResult.dmarc, help: 'Enregistrement TXT v=DMARC1 sur _dmarc' },
                  ].map(({ label, result, help }) => (
                    <Col xs={24} sm={8} key={label}>
                      <Card size="small" type="inner" title={label} style={{ minHeight: 160 }}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Tag color={result.found ? 'success' : 'warning'}>
                            {result.found ? 'Trouvé' : 'Non trouvé'}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{help}</Text>
                          {result.error ? <Text type="danger">{result.error}</Text> : null}
                          {result.record ? <Text code style={{ wordBreak: 'break-word' }}>{result.record}</Text> : null}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Space>
            </Card>
          )}
        </Space>
      </Card>

      <Card title="Éditeur de templates email" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} sm={16}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">
                Créez et gérez les templates HTML utilisés pour les campagnes d’emailing.
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Utilisez des variables comme <Text code>{'{firstName}'}</Text> dans le corps du message.
              </Text>
            </Space>
          </Col>
          <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openTemplateCreate()}>
              Nouveau template
            </Button>
          </Col>
        </Row>

        <Table
          rowKey="id"
          columns={templateColumns}
          dataSource={templates}
          loading={templateLoading}
          pagination={{ pageSize: 8, showTotal: (total) => `${total} template(s)` }}
          scroll={{ x: 900 }}
          style={{ marginTop: 16 }}
        />
      </Card>

      <Modal
        title={<Space><MailOutlined /><span>{editingConfig ? 'Modifier' : 'Nouvelle'} configuration SMTP</span></Space>}
        open={modalOpen}
        onOk={() => void saveConfig()}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={saving}
        width={600}
        okText={editingConfig ? 'Enregistrer' : 'Créer'}
      >
        <Form form={form} layout="vertical" initialValues={{ dailyLimit: DEFAULT_SMTP_DAILY_LIMIT, isActive: true }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="label" label="Nom du compte" rules={[{ required: true, message: 'Nom requis' }]}> 
                <Input placeholder="Ex: SMTP principal" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="host" label="Hôte SMTP" rules={[{ required: true, message: 'Hôte requis' }]}> 
                <Input placeholder="smtp.example.com" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="port" label="Port" rules={[{ required: true, message: 'Port requis' }]}> 
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="dailyLimit" label="Quota journalier" rules={[{ required: true, type: 'number', message: 'Quota requis' }]}> 
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="login" label="Login SMTP" rules={[{ required: !editingConfig, message: 'Login requis' }]}> 
                <Input placeholder="login@mail.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="password" label="Mot de passe SMTP" rules={[{ required: !editingConfig, message: 'Mot de passe requis' }]}> 
                <Input.Password placeholder={editingConfig ? 'Laisser vide pour conserver' : 'Mot de passe'} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="fromName" label="Nom expéditeur" rules={[{ max: 100 }]}>
                <Input placeholder="CRM Lead Dashboard" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fromEmail" label="Email expéditeur" rules={[{ type: 'email', message: 'Email invalide' }]}>
                <Input placeholder="no-reply@example.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isActive" valuePropName="checked">
            <Checkbox>Activer ce compte SMTP</Checkbox>
          </Form.Item>
          <Space style={{ marginTop: 10 }}>
            <Button type="default" onClick={() => void testConnection()} loading={testing}>
              Tester la connexion
            </Button>
            <Button type="primary" onClick={() => void saveConfig()} loading={saving}>
              {editingConfig ? 'Enregistrer' : 'Créer'}
            </Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={<Space><MailOutlined /><span>{editingTemplate ? 'Modifier' : 'Nouveau'} template email</span></Space>}
        open={templateModalOpen}
        onOk={() => void saveTemplate()}
        onCancel={() => { setTemplateModalOpen(false); templateForm.resetFields(); setEditingTemplate(null); }}
        confirmLoading={templateSaving}
        width={800}
        okText={editingTemplate ? 'Enregistrer' : 'Créer'}
      >
        <Form form={templateForm} layout="vertical" initialValues={{ variables: '' }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="Nom du template" rules={[{ required: true, message: 'Nom requis' }]}> 
                <Input placeholder="Ex: Relance 1" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="category" label="Catégorie" rules={[{ max: 100 }]}> 
                <Input placeholder="Ex: Prospect" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="subject" label="Sujet" rules={[{ required: true, message: 'Sujet requis' }]}> 
                <Input placeholder="Objet de l'email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="bodyHtml" label="Corps HTML" rules={[{ required: true, message: 'Corps requis' }]}> 
                <Input.TextArea rows={10} placeholder="HTML du message, utilisez {{firstName}}..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="variables" label="Variables" help="Séparez les variables par des virgules (ex: firstName, company)."> 
                <Input placeholder="firstName, company" />
              </Form.Item>
            </Col>
          </Row>
          <Card type="inner" title="Aperçu" size="small" style={{ marginTop: 16 }}>
            <div style={{ minHeight: 120, padding: 12, background: '#fafafa', borderRadius: 6 }}>
              <div dangerouslySetInnerHTML={{ __html: templateForm.getFieldValue('bodyHtml') ?? '<em>Aperçu du HTML ici</em>' }} />
            </div>
          </Card>
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
  const isMobile = useIsMobile();

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div
        className="page-hero"
        style={{
          background: "linear-gradient(135deg,#722ed1 0%,#531dab 100%)",
          alignItems: "center",
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
          <Title level={isMobile ? 4 : 3} style={{ color: "#fff", margin: 0 }}>Administration</Title>
          <Text style={{ color: "rgba(255,255,255,0.75)" }}>
            Gestion des utilisateurs, configuration du scoring et supervision globale
          </Text>
        </div>
      </div>

      <Tabs
        defaultActiveKey="overview"
        size={isMobile ? "small" : "large"}
        tabBarGutter={isMobile ? 12 : 24}
        tabBarStyle={{ marginBottom: 0 }}
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
            key: "emailing",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#722ed1" }} />
                Emailing
              </Space>
            ),
            children: <EmailingTab />,
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
