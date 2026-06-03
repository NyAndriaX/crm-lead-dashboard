"use client";

/**
 * Page Administration — CRM-071.
 * Tabs : Vue d'ensemble · Utilisateurs · Scoring · Imports
 */
import { useCallback, useEffect, useState } from "react";
import { EmailHtmlDualEditor } from "@/components/emailing/EmailHtmlDualEditor";
import { EmailHtmlLivePreview } from "@/components/emailing/EmailHtmlLivePreview";
import { EmailTemplateAiVariants } from "@/components/emailing/EmailTemplateAiVariants";
import { ImapSection } from "@/components/emailing/ImapSection";
import { TeamsSection } from "@/components/admin/TeamsSection";
import { PermissionsSection } from "@/components/admin/PermissionsSection";
import { AuditLogsSection } from "@/components/admin/AuditLogsSection";
import { SystemSection } from "@/components/admin/SystemSection";
import { SecuritySection } from "@/components/admin/SecuritySection";
import { PipelineStagesSection } from "@/components/admin/PipelineStagesSection";
import { WebhooksSection } from "@/components/admin/WebhooksSection";
import { RgpdSection } from "@/components/admin/RgpdSection";
import {
  Tabs, Card, Typography, Table, Button, Tag, Space, Form, InputNumber, Row, Col,
  Statistic, Badge, Modal, Input, Select, message, Spin, Alert, Popconfirm, List,
  Progress, Divider, Avatar, Tooltip, Checkbox, Collapse,
} from "antd";
import {
  UserOutlined, TrophyOutlined, UploadOutlined, PlusOutlined, EditOutlined,
  StopOutlined, CheckOutlined, ReloadOutlined, SafetyOutlined, FireOutlined,
  TeamOutlined, CalendarOutlined, SettingOutlined, LockOutlined, DeleteOutlined,
  MailOutlined, CloudOutlined, CodeOutlined, EyeOutlined, CopyOutlined, BookOutlined,
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
  teamId?: string | null;
  twoFactorOn?: boolean;
  invitedAt?: string | null;
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
  isPreset: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateBlockRow {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  htmlContent: string;
  variables: string[];
  isPublic: boolean;
  createdAt: string;
  createdBy?: { name: string };
}

interface TemplateFormValues {
  name: string;
  category?: string;
  subject: string;
  bodyHtml: string;
  variables: string;
  isPublic: boolean;
}

interface TemplateBlockFormValues {
  name: string;
  category: string;
  description?: string;
  htmlContent: string;
  variables: string;
  isPublic: boolean;
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

/** Guide intégré SPF / DKIM / DMARC ; le vérificateur est branché sur l’API. */
function DnsSenderAuthGuide(props: {
  domainInput: string;
  dkimSelectorInput: string;
  onDomainChange: (domain: string) => void;
  smtpConfigs: SmtpConfigRow[];
}) {
  const d = props.domainInput.trim() || "exemple.fr";
  const sel = props.dkimSelectorInput.trim() || "default";
  const dmarcFqdn = `_dmarc.${d}`;
  const dkimFqdn = `${sel}._domainkey.${d}`;

  async function copyTxt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success("Copié dans le presse-papiers");
    } catch {
      message.error("Copie impossible — sélectionnez le texte manuellement.");
    }
  }

  const suggestedDomain = (() => {
    for (const c of props.smtpConfigs) {
      const e = c.fromEmail?.trim();
      if (!e?.includes("@")) continue;
      const host = e.split("@").pop()?.trim().toLowerCase();
      if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return host;
    }
    return null;
  })();

  const dmarcExample = `v=DMARC1; p=none; rua=mailto:postmaster@${d}; fo=1; adkim=s; aspf=s`;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="Authentification de l’expéditeur"
        description={
          <span>
            SPF, DKIM et DMARC réduisent le risque que vos campagnes finissent en spam. Ce bloc résume la configuration
            attendue ; utilisez ensuite le vérificateur ci-dessous pour contrôler la zone DNS publique de votre domaine.
          </span>
        }
      />
      <Collapse
        bordered={false}
        expandIconPosition="end"
        style={{ background: "#fafafa", borderRadius: 8 }}
        items={[
          {
            key: "spf",
            label: (
              <Space wrap>
                <BookOutlined />
                <Tag color="blue">SPF</Tag>
                <Text>Quels serveurs peuvent envoyer des e-mails pour votre domaine ?</Text>
              </Space>
            ),
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <List
                  size="small"
                  dataSource={[
                    "Créez un enregistrement TXT sur le nom racine du domaine d’envoi (souvent « @ » ou le FQDN du domaine, ex. exemple.fr).",
                    "Une seule politique SPF par domaine : regroupez tous les `include:` et `ip4:` / `ip6:` nécessaires (fournisseur SMTP, Google Workspace, etc.).",
                    "Terminez par `~all` (soft fail) pendant les tests, puis `-all` uniquement lorsque vous êtes certain que tous les envois passent par des sources déclarées.",
                  ]}
                  renderItem={(item) => (
                    <List.Item style={{ padding: "4px 0" }}>
                      <Text type="secondary">{item}</Text>
                    </List.Item>
                  )}
                />
                <div>
                  <Text strong>Exemple générique</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 13 }}>
                    Remplacez <Text code>include:_spf.mail-provider.example</Text> par la valeur indiquée par votre hébergeur d’e-mails.
                  </Paragraph>
                  <Space wrap align="start">
                    <Text code style={{ wordBreak: "break-all", whiteSpace: "pre-wrap", maxWidth: "100%", display: "inline-block" }}>
                      v=spf1 include:_spf.mail-provider.example ~all
                    </Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyTxt("v=spf1 include:_spf.mail-provider.example ~all")}>
                      Copier
                    </Button>
                  </Space>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Le vérificateur lit les enregistrements TXT du nom : <Text code>{d}</Text> et recherche une valeur commençant par{" "}
                  <Text code>v=spf1</Text>.
                </Text>
              </Space>
            ),
          },
          {
            key: "dkim",
            label: (
              <Space wrap>
                <BookOutlined />
                <Tag color="purple">DKIM</Tag>
                <Text>Signature cryptographique des messages</Text>
              </Space>
            ),
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <List
                  size="small"
                  dataSource={[
                    "Le sélecteur est un préfixe choisi par votre outil d’envoi (ex. default, google, k1, mail). Consultez la documentation de votre fournisseur SMTP.",
                    "Ajoutez un enregistrement TXT sur le nom hôte : <sélecteur>._domainkey.<votre-domaine>.",
                    "La valeur contient en général v=DKIM1, le type de clé (souvent k=rsa) et la clé publique p=… fournie par l’outil.",
                  ]}
                  renderItem={(item) => (
                    <List.Item style={{ padding: "4px 0" }}>
                      <Text type="secondary">{item}</Text>
                    </List.Item>
                  )}
                />
                <div>
                  <Text strong>Nom d’hôte attendu pour la vérification</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    <Text code style={{ wordBreak: "break-all" }}>{dkimFqdn}</Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyTxt(dkimFqdn)}>
                      Copier le FQDN
                    </Button>
                  </Space>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Saisissez le même sélecteur dans le champ « Sélecteur DKIM » puis lancez la vérification. Sans sélecteur, DKIM ne peut pas être testé.
                </Text>
              </Space>
            ),
          },
          {
            key: "dmarc",
            label: (
              <Space wrap>
                <BookOutlined />
                <Tag color="geekblue">DMARC</Tag>
                <Text>Politique globale sur SPF / DKIM</Text>
              </Space>
            ),
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <List
                  size="small"
                  dataSource={[
                    "Créez un enregistrement TXT sur le sous-domaine _dmarc (nom complet : _dmarc.votredomaine).",
                    "Commencez souvent avec p=none pour collecter les rapports sans bloquer les messages, puis passez à p=quarantine ou p=reject.",
                    "Renseignez rua= (agrégés) et éventuellement ruf= (échecs) vers des adresses mail dédiées.",
                  ]}
                  renderItem={(item) => (
                    <List.Item style={{ padding: "4px 0" }}>
                      <Text type="secondary">{item}</Text>
                    </List.Item>
                  )}
                />
                <div>
                  <Text strong>Nom d’hôte DMARC</Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    <Text code>{dmarcFqdn}</Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyTxt(dmarcFqdn)}>
                      Copier le FQDN
                    </Button>
                  </Space>
                </div>
                <div>
                  <Text strong>Exemple de valeur (à ajuster)</Text>
                  <Space wrap style={{ marginTop: 8 }} align="start">
                    <Text code style={{ wordBreak: "break-all", whiteSpace: "pre-wrap", maxWidth: "100%", display: "inline-block" }}>
                      {dmarcExample}
                    </Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => void copyTxt(dmarcExample)}>
                      Copier
                    </Button>
                  </Space>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Le vérificateur lit les TXT de <Text code>{dmarcFqdn}</Text> et attend <Text code>v=DMARC1</Text>.
                </Text>
              </Space>
            ),
          },
        ]}
      />
      {suggestedDomain ? (
        <Card size="small" type="inner" styles={{ body: { padding: "12px 16px" } }}>
          <Space wrap align="center">
            <Text type="secondary">Domaine détecté depuis un e-mail expéditeur SMTP configuré :</Text>
            <Tag color="processing">{suggestedDomain}</Tag>
            <Button
              size="small"
              type="link"
              onClick={() => {
                props.onDomainChange(suggestedDomain);
                message.info("Domaine appliqué — vérifiez le sélecteur DKIM auprès de votre fournisseur.");
              }}
            >
              Remplir le champ « Domaine »
            </Button>
          </Space>
        </Card>
      ) : null}
      <Divider orientation="left" plain>
        <Space>
          <SafetyOutlined />
          <span>Vérificateur DNS</span>
        </Space>
      </Divider>
    </Space>
  );
}

// ── Onglet Vue d'ensemble ────────────────────────────────────────────────────

function WorkerAgendaTimezoneCard() {
  const [zones] = useState(() =>
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC", "Europe/Paris", "Europe/Brussels", "America/New_York", "Asia/Tokyo"],
  );
  const [tz, setTz] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ data: { agendaTimezone: string } }>("/admin/worker-config")
      .then((r) => {
        setTz(r.data.data.agendaTimezone);
        setVisible(true);
      })
      .catch(() => setVisible(false))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await api.patch<{ data: { agendaTimezone: string }; info?: string }>("/admin/worker-config", {
        agendaTimezone: tz,
      });
      setTz(res.data.data.agendaTimezone);
      message.success(res.data.info ?? "Fuseau enregistré.");
    } catch {
      message.error("Modification réservée aux administrateurs (permission Paramètres).");
    } finally {
      setSaving(false);
    }
  }

  if (!visible || loading) return null;

  return (
    <Card
      title={<Space><CloudOutlined style={{ color: "#1677ff" }} /><span>Worker — fuseau horaire (Agenda)</span></Space>}
      style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary">
          Identifiant IANA (ex. Europe/Paris). Appliqué au processus Node du worker via <Text code>TZ</Text> et aux
          planifications Agenda de type cron qui précisent un fuseau. Redémarrer le worker après changement.
        </Text>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ maxWidth: 420, width: "100%" }}
          options={zones.map((z) => ({ label: z, value: z }))}
          value={tz}
          onChange={setTz}
        />
        <Button type="primary" loading={saving} onClick={() => void save()}>
          Enregistrer
        </Button>
      </Space>
    </Card>
  );
}

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

  const statusOrder = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"];
  const STATUS_HEX: Record<string, string> = {
    NOUVEAU: "#8c8c8c", CONTACTE: "#1677ff", QUALIFIE: "#13c2c2",
    EN_DISCUSSION: "#faad14", CONVERTI: "#52c41a", PERDU: "#ff4d4f",
  };

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      {error ? (
        <Alert type="warning" message="Statistiques réservées aux rôles Admin et Manager." showIcon style={{ marginBottom: 16 }} />
      ) : null}
      {!error && stats ? (
        <>
      {/* ── KPI row ── */}
      <Row gutter={[16, 16]}>
        {[
          { label: "Total leads", value: stats.leads.total, color: "#1677ff", icon: <TeamOutlined />, sub: `${stats.leads.active} actifs` },
          { label: "Nouveaux aujourd'hui", value: stats.leads.newToday, color: "#13c2c2", icon: <CalendarOutlined />, sub: `${stats.leads.newThisWeek} cette semaine` },
          { label: "Ce mois", value: stats.leads.newThisMonth, color: "#722ed1", icon: <FireOutlined />, sub: "leads créés" },
          { label: "Utilisateurs actifs", value: stats.users.active, color: "#52c41a", icon: <UserOutlined />, sub: `/ ${stats.users.total} comptes` },
        ].map(({ label, value, color, icon, sub }) => (
          <Col xs={24} sm={12} xl={6} key={label}>
            <Card styles={{ body: { padding: "16px 18px" } }} style={{ borderTop: `3px solid ${color}` }}>
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
        </>
      ) : null}
      <WorkerAgendaTimezoneCard />
    </Space>
  );
}

// ── Onglet Utilisateurs ──────────────────────────────────────────────────────

type TeamOption = { id: string; name: string };

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [createForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [u, t] = await Promise.all([
        api.get<{ data: UserRow[] }>("/users?all=true"),
        api.get<{ data: TeamOption[] }>("/teams"),
      ]);
      setUsers(u.data.data);
      setTeams(t.data.data ?? []);
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

  async function inviteUser() {
    const values = await inviteForm.validateFields();
    setSaving(true);
    try {
      const { data } = await api.post<{
        email: { sent: boolean; error: string | null; acceptUrl?: string };
      }>("/users/invite", values);
      if (data.email.sent) {
        message.success(`Invitation envoyée à ${values.email}`);
      } else if (data.email.acceptUrl) {
        message.warning(data.email.error ?? "Email non envoyé — utilisez le lien direct ci-dessous.");
        Modal.info({
          title: "Lien d'invitation (mode dev)",
          width: 600,
          content: (
            <div>
              <p>Le compte est créé mais l'email n'a pas pu être envoyé.</p>
              <p>Communiquez ce lien à l'invité :</p>
              <Input.TextArea value={data.email.acceptUrl} rows={2} readOnly />
            </div>
          ),
        });
      } else {
        message.error(data.email.error ?? "Email d'invitation non envoyé.");
      }
      inviteForm.resetFields();
      setInviteOpen(false);
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function deleteUserPermanently(user: UserRow) {
    try {
      const { data } = await api.delete<{
        data: { unassignedLeads: number };
      }>(`/users/${user.id}?hard=true`);
      const n = data.data.unassignedLeads;
      message.success(
        n > 0
          ? `${user.name} supprimé définitivement — ${n} lead(s) remis dans le pool.`
          : `${user.name} supprimé définitivement.`,
      );
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  async function reset2fa(user: UserRow) {
    try {
      await api.post(`/users/${user.id}/reset-2fa`);
      message.success(`2FA réinitialisée pour ${user.name}`);
      void fetchUsers();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  async function forceLogout(user: UserRow) {
    try {
      await api.post(`/users/${user.id}/force-logout`);
      message.success(`Sessions de ${user.name} invalidées`);
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
      title: "Équipe", key: "team", width: 150, responsive: ["md"],
      render: (_, r) => {
        const team = r.teamId ? teams.find((t) => t.id === r.teamId) : null;
        return team
          ? <Tag color="blue">{team.name}</Tag>
          : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
      },
    },
    {
      title: "Statut", dataIndex: "isActive", key: "isActive", width: 110, responsive: ["md"],
      render: (v: boolean, r) => v
        ? (r.invitedAt && !r.lastLoginAt
            ? <Badge status="warning" text={<Text style={{ fontSize: 12, color: "#fa8c16" }}>Invité</Text>} />
            : <Badge status="success" text={<Text style={{ fontSize: 12, color: "#52c41a" }}>Actif</Text>} />)
        : <Badge status="error" text={<Text style={{ fontSize: 12, color: "#ff4d4f" }}>Inactif</Text>} />,
    },
    {
      title: "2FA", dataIndex: "twoFactorOn", key: "twoFactorOn", width: 80, responsive: ["lg"],
      align: "center",
      render: (v: boolean) => v
        ? <Tooltip title="2FA activée"><SafetyOutlined style={{ color: "#52c41a", fontSize: 16 }} /></Tooltip>
        : <Tooltip title="2FA inactive"><SafetyOutlined style={{ color: "#d9d9d9", fontSize: 16 }} /></Tooltip>,
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
      title: "", key: "actions", width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Modifier">
            <Button
              size="small" icon={<EditOutlined />}
              onClick={() => {
                setEditUser(r);
                editForm.setFieldsValue({ name: r.name, role: r.role, teamId: r.teamId ?? null });
              }}
            />
          </Tooltip>
          {r.twoFactorOn && (
            <Tooltip title="Réinitialiser la 2FA">
              <Popconfirm
                title={`Réinitialiser la 2FA de ${r.name} ?`}
                description="L'utilisateur devra réenrôler son 2FA (et sera déconnecté)."
                onConfirm={() => void reset2fa(r)}
                okText="Réinitialiser" cancelText="Annuler"
              >
                <Button size="small" icon={<SafetyOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
          {r.isActive && (
            <Tooltip title="Forcer la déconnexion">
              <Popconfirm
                title={`Déconnecter ${r.name} ?`}
                description="Toutes ses sessions seront invalidées."
                onConfirm={() => void forceLogout(r)}
                okText="Déconnecter" cancelText="Annuler"
              >
                <Button size="small" icon={<LockOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
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
          {r.role !== "ADMIN" && (
            <Tooltip title="Supprimer définitivement">
              <Popconfirm
                title={`Supprimer définitivement ${r.name} ?`}
                description={
                  <div style={{ maxWidth: 280 }}>
                    Action <strong>irréversible</strong>. Le compte est supprimé,
                    ses leads sont remis dans le pool (non assignés), ses vues et
                    notifications sont effacées. Préférez « Désactiver » si vous
                    voulez pouvoir réactiver le compte plus tard.
                  </div>
                }
                onConfirm={() => void deleteUserPermanently(r)}
                okText="Supprimer définitivement"
                okButtonProps={{ danger: true }}
                cancelText="Annuler"
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
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
            <Card size="small" styles={{ body: { padding: "12px 20px" } }}>
              <Statistic title={<Text style={{ fontSize: 12 }}>{label}</Text>} value={value} valueStyle={{ fontSize: 20, color }} />
            </Card>
          </Col>
        ))}
        <Col flex="auto" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()}>Actualiser</Button>
          <Button icon={<MailOutlined />} onClick={() => setInviteOpen(true)}>
            Inviter par email
          </Button>
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
          <Form.Item name="teamId" label="Équipe (optionnel)">
            <Select
              allowClear
              placeholder="Aucune équipe"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modale invitation par email */}
      <Modal
        title={<Space><MailOutlined /><span>Inviter un utilisateur par email</span></Space>}
        open={inviteOpen}
        onOk={() => void inviteUser()}
        onCancel={() => { setInviteOpen(false); inviteForm.resetFields(); }}
        confirmLoading={saving}
        okText="Envoyer l'invitation"
        cancelText="Annuler"
        width={480}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          L'utilisateur recevra un email avec un lien d'activation (valide 7 jours)
          lui permettant de définir son propre mot de passe.
        </Paragraph>
        <Form form={inviteForm} layout="vertical">
          <Form.Item name="name" label="Nom complet" rules={[{ required: true, message: "Champ requis" }]}>
            <Input prefix={<UserOutlined />} placeholder="Jean Dupont" />
          </Form.Item>
          <Form.Item name="email" label="Adresse email" rules={[{ required: true, type: "email", message: "Email invalide" }]}>
            <Input prefix="@" placeholder="jean@exemple.com" />
          </Form.Item>
          <Form.Item name="role" label="Rôle" initialValue="COMMERCIAL">
            <Select
              options={Object.entries(ROLE_LABELS).map(([v, l]) => ({
                value: v,
                label: <Space><Tag color={ROLE_COLORS[v]}>{l}</Tag></Space>,
              }))}
            />
          </Form.Item>
          <Form.Item name="teamId" label="Équipe (optionnel)">
            <Select
              allowClear
              placeholder="Aucune équipe"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
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
        width={420}
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
          <Form.Item name="teamId" label="Équipe">
            <Select
              allowClear
              placeholder="Aucune équipe"
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
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
  const [templateBlocks, setTemplateBlocks] = useState<TemplateBlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateBlockLoading, setTemplateBlockLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateBlockSaving, setTemplateBlockSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsSelector, setDnsSelector] = useState("");
  const [dnsResult, setDnsResult] = useState<SmtpDnsCheckResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateBlockModalOpen, setTemplateBlockModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SmtpConfigRow | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [editingTemplateBlock, setEditingTemplateBlock] = useState<TemplateBlockRow | null>(null);
  const [form] = Form.useForm<SmtpFormValues>();
  const [templateForm] = Form.useForm<TemplateFormValues>();
  const [templateBlockForm] = Form.useForm<TemplateBlockFormValues>();
  const templateBodyHtmlWatch = Form.useWatch("bodyHtml", templateForm);
  const blockHtmlContentWatch = Form.useWatch("htmlContent", templateBlockForm);
  const isMobile = useIsMobile();

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

  const fetchTemplateBlocks = useCallback(async () => {
    setTemplateBlockLoading(true);
    try {
      const { data } = await api.get<{ data: TemplateBlockRow[] }>('/template-blocks');
      setTemplateBlocks(data.data);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Impossible de charger les blocs de template.';
      message.error(msg);
    } finally {
      setTemplateBlockLoading(false);
    }
  }, []);

  useEffect(() => { void fetchConfigs(); void fetchTemplates(); void fetchTemplateBlocks(); }, [fetchConfigs, fetchTemplates, fetchTemplateBlocks]);

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
    setSmtpTestResult(null);
    try {
      const values = await form.validateFields(['host', 'port', 'login', 'password']);
      setTesting(true);
      await api.post('/smtp-configs/test', {
        host: values.host,
        port: values.port,
        login: values.login,
        password: values.password,
      });
      const successMessage = 'Connexion SMTP réussie';
      setSmtpTestResult({ type: 'success', message: successMessage });
      message.success(successMessage);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur de connexion SMTP';
      setSmtpTestResult({ type: 'error', message: msg });
      message.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function openTemplateCreate() {
    setEditingTemplate(null);
    templateForm.resetFields();
    templateForm.setFieldsValue({ variables: '', isPublic: true });
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
      isPublic: template.isPublic ?? true,
    });
    setTemplateModalOpen(true);
  }

  async function duplicateTemplateRow(row: TemplateRow) {
    try {
      const { data } = await api.post<{ data: TemplateRow }>(`/templates/${row.id}/duplicate`);
      message.success(`Modèle dupliqué : ${data.data.name}`);
      void fetchTemplates();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Impossible de dupliquer le template';
      message.error(msg);
    }
  }

  async function duplicateTemplateBlockRow(row: TemplateBlockRow) {
    try {
      const { data } = await api.post<{ data: TemplateBlockRow }>(`/template-blocks/${row.id}/duplicate`);
      message.success(`Bloc dupliqué : ${data.data.name}`);
      void fetchTemplateBlocks();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Impossible de dupliquer le bloc';
      message.error(msg);
    }
  }

  async function saveTemplate() {
    const values = await templateForm.validateFields();
    const payload = {
      name: values.name,
      category: values.category?.trim() || undefined,
      subject: values.subject,
      bodyHtml: values.bodyHtml,
      isPublic: values.isPublic,
      variables: (values.variables ?? '')
        .split(',')
        .map((item: string) => item.trim())
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

  async function openTemplateBlockCreate() {
    setEditingTemplateBlock(null);
    templateBlockForm.resetFields();
    templateBlockForm.setFieldsValue({ variables: '', isPublic: true });
    setTemplateBlockModalOpen(true);
  }

  async function openTemplateBlockEdit(templateBlock: TemplateBlockRow) {
    setEditingTemplateBlock(templateBlock);
    templateBlockForm.setFieldsValue({
      name: templateBlock.name,
      category: templateBlock.category,
      description: templateBlock.description ?? undefined,
      htmlContent: templateBlock.htmlContent,
      variables: templateBlock.variables.join(', '),
      isPublic: templateBlock.isPublic,
    });
    setTemplateBlockModalOpen(true);
  }

  async function saveTemplateBlock() {
    const values = await templateBlockForm.validateFields();
    const payload = {
      name: values.name,
      category: values.category,
      description: values.description?.trim() || undefined,
      htmlContent: values.htmlContent,
      variables: (values.variables ?? '')
        .split(',')
        .map((item: string) => item.trim())
        .filter(Boolean),
      isPublic: values.isPublic,
    };

    setTemplateBlockSaving(true);
    try {
      if (editingTemplateBlock) {
        await api.put(`/template-blocks/${editingTemplateBlock.id}`, payload);
        message.success('Bloc de template mis à jour');
      } else {
        await api.post('/template-blocks', payload);
        message.success('Bloc de template créé');
      }
      setTemplateBlockModalOpen(false);
      void fetchTemplateBlocks();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de l’enregistrement du bloc de template';
      message.error(msg);
    } finally {
      setTemplateBlockSaving(false);
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

  async function deleteTemplateBlock(templateBlock: TemplateBlockRow) {
    try {
      await api.delete(`/template-blocks/${templateBlock.id}`);
      message.success('Bloc de template supprimé');
      void fetchTemplateBlocks();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de la suppression du bloc de template';
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
    {
      title: 'Origine',
      key: 'isPreset',
      width: 110,
      render: (_: unknown, row) =>
        row.isPreset ? <Tag color="purple">Catalogue</Tag> : <Tag>Personnalisé</Tag>,
    },
    {
      title: 'Partagé',
      dataIndex: 'isPublic',
      key: 'isPublic',
      width: 90,
      render: (v: boolean) => (v ? <Tag color="success">Oui</Tag> : <Tag>Non</Tag>),
    },
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
      title: '',
      key: 'actions',
      width: 220,
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => void openTemplateEdit(row)}>Modifier</Button>
          <Tooltip title="Dupliquer en modèle indépendant (préréglé ou non)">
            <Button size="small" icon={<CopyOutlined />} onClick={() => void duplicateTemplateRow(row)} />
          </Tooltip>
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

  const templateBlockColumns: ColumnsType<TemplateBlockRow> = [
    { title: 'Nom', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Catégorie', dataIndex: 'category', key: 'category', ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Variables', dataIndex: 'variables', key: 'variables', ellipsis: true,
      render: (value: string[]) => value.length > 0 ? value.join(', ') : 'Aucune',
    },
    {
      title: 'Public', dataIndex: 'isPublic', key: 'isPublic', width: 100,
      render: (value: boolean) => value
        ? <Tag color="success">Oui</Tag>
        : <Tag color="default">Non</Tag>,
    },
    {
      title: 'Créé par', key: 'createdBy', width: 120,
      render: (_, row) => row.createdBy?.name ?? 'Système',
    },
    {
      title: '',
      key: 'actions',
      width: 210,
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => void openTemplateBlockEdit(row)}>Modifier</Button>
          <Tooltip title="Dupliquer le bloc">
            <Button size="small" icon={<CopyOutlined />} onClick={() => void duplicateTemplateBlockRow(row)} />
          </Tooltip>
          <Popconfirm
            title={`Supprimer ${row.name} ?`}
            onConfirm={() => void deleteTemplateBlock(row)}
            okText="Supprimer"
            cancelText="Annuler"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const previewEmptyHtml =
    '<p style="margin:16px;color:#8c8c8c;font-family:system-ui,sans-serif;font-size:13px">Saisissez du HTML dans l’éditeur pour afficher l’aperçu ici.</p>';

  return (
    <Space direction="vertical" size={28} style={{ width: "100%" }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          background: "linear-gradient(135deg, #f9f0ff 0%, #efdbff 42%, #ffffff 100%)",
          border: "1px solid #d3adf7",
          boxShadow: "0 2px 8px rgba(114, 46, 209, 0.08)",
        }}
      >
        <Row align="middle" gutter={[16, 16]}>
          <Col flex="none">
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "linear-gradient(145deg, #722ed1 0%, #391085 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(114, 46, 209, 0.35)",
              }}
            >
              <MailOutlined style={{ fontSize: 26, color: "#fff" }} />
            </div>
          </Col>
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              Emailing
            </Title>
            <Text type="secondary">
              Comptes SMTP, vérification DNS (SPF / DKIM / DMARC) et bibliothèque de templates HTML.
            </Text>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            <CloudOutlined style={{ color: "#1677ff" }} />
            <span>Configuration SMTP</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Ajouter un compte SMTP
          </Button>
        }
        style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Les identifiants sont stockés de façon sécurisée et servent à l’envoi des campagnes.
        </Text>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={configs}
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => `${total} compte(s)` }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card
        title={
          <Space>
            <SafetyOutlined style={{ color: "#52c41a" }} />
            <span>Guide et vérification DNS (SPF / DKIM / DMARC)</span>
          </Space>
        }
        style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <DnsSenderAuthGuide
            domainInput={dnsDomain}
            dkimSelectorInput={dnsSelector}
            onDomainChange={setDnsDomain}
            smtpConfigs={configs}
          />
          <Text type="secondary">
            Saisissez le domaine d’envoi (sans <Text code>mailto:</Text>) et le sélecteur DKIM fourni par votre outil, puis lancez la vérification.
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

      <Card
        title={
          <Space>
            <CodeOutlined style={{ color: "#722ed1" }} />
            <span>Éditeur de templates email</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openTemplateCreate()}>
            Nouveau template
          </Button>
        }
        style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Bibliothèque (catalogue + partage)"
          description={
            <span>
              Les modèles marqués <Tag color="purple">Catalogue</Tag> proviennent des exemples livrés avec le CRM (réinitialisables via le seed).
              Utilisez <strong>Dupliquer</strong> pour partir d’un préréglé sans le modifier à la source. Cochez <strong>Visible par tous</strong> pour partager un modèle personnalisé avec les utilisateurs autorisés.
            </span>
          }
        />
        <Space direction="vertical" size={4} style={{ width: "100%", marginBottom: 8 }}>
          <Text type="secondary">
            Éditeur double onglet (visuel / HTML), variables de fusion <Text code>{"{{prenom}}"}</Text>, aperçu bureau et mobile.
            {" "}
            Optionnel : dans les modales de création ou d’édition, la section « Suggestions IA » propose des variantes de ton via OpenAI lorsque <a href="/account">Mon compte → Intégration IA</a> est configurée par chaque utilisateur.
          </Text>
        </Space>
        <Table
          rowKey="id"
          columns={templateColumns}
          dataSource={templates}
          loading={templateLoading}
          pagination={{ pageSize: 8, showTotal: (total) => `${total} template(s)` }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Card
        title={
          <Space>
            <MailOutlined style={{ color: "#eb2f96" }} />
            <span>Bibliothèque de blocs de contenu</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openTemplateBlockCreate()}>
            Nouveau bloc
          </Button>
        }
        style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}
      >
        <Space direction="vertical" size={4} style={{ width: "100%", marginBottom: 8 }}>
          <Text type="secondary">
            Blocs réutilisables : duplication en un clic, partage public ou privé.
          </Text>
        </Space>
        <Table
          rowKey="id"
          columns={templateBlockColumns}
          dataSource={templateBlocks}
          loading={templateBlockLoading}
          pagination={{ pageSize: 8, showTotal: (total) => `${total} bloc(s)` }}
          scroll={{ x: 1000 }}
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
          {smtpTestResult && (
            <Alert
              type={smtpTestResult.type}
              message={smtpTestResult.message}
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={<Space><MailOutlined /><span>{editingTemplate ? 'Modifier' : 'Nouveau'} template email</span></Space>}
        open={templateModalOpen}
        onOk={() => void saveTemplate()}
        onCancel={() => { setTemplateModalOpen(false); templateForm.resetFields(); setEditingTemplate(null); }}
        confirmLoading={templateSaving}
        width={isMobile ? "min(100%, 520px)" : 1040}
        styles={{ body: { maxHeight: "calc(100vh - 200px)", overflowY: "auto" } }}
        okText={editingTemplate ? 'Enregistrer' : 'Créer'}
      >
        <Form form={templateForm} layout="vertical" initialValues={{ variables: '', isPublic: true }}>
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
              <Form.Item
                name="isPublic"
                valuePropName="checked"
                help="Si décoché, le modèle reste utilisable par vous mais n’apparaît pas comme « partagé » pour les autres (évolution future : filtrage par équipe)."
              >
                <Checkbox>Modèle visible par tous les utilisateurs (bibliothèque partagée)</Checkbox>
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" plain>
            <Space size={6}>
              <CodeOutlined />
              <span>Corps du message</span>
            </Space>
          </Divider>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Form.Item
                name="bodyHtml"
                label="Éditeur visuel + HTML"
                rules={[
                  {
                    validator: async (_, v) => {
                      if (typeof v !== "string" || !v.trim()) {
                        throw new Error("Corps du message requis");
                      }
                    },
                  },
                ]}
                extra="Onglet Visuel (Quill) pour le texte riche ; onglet HTML (Monaco) pour le code. Basculez selon vos besoins — le contenu est synchronisé."
              >
                <EmailHtmlDualEditor
                  monacoHeight={isMobile ? "260px" : "420px"}
                  quillHeight={isMobile ? 220 : 340}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={10}>
              <Form.Item label={<Space><EyeOutlined /><span>Aperçu en direct</span></Space>}>
                <EmailHtmlLivePreview
                  html={typeof templateBodyHtmlWatch === "string" ? templateBodyHtmlWatch : ""}
                  emptyHtml={previewEmptyHtml}
                  minHeight={isMobile ? 200 : 300}
                  maxHeight={isMobile ? 280 : 420}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <EmailTemplateAiVariants form={templateForm} mode="template" />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                name="variables"
                label="Variables"
                help="Champs utilisables côté envoi : liste séparée par des virgules (ex: prenom, entreprise). Dans le HTML vous pouvez aussi utiliser {{prenom}}, {{entreprise}}, {{actu}}, {{custom}}."
              >
                <Input placeholder="prenom, entreprise, actu" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={<Space><MailOutlined /><span>{editingTemplateBlock ? 'Modifier' : 'Nouveau'} bloc de contenu</span></Space>}
        open={templateBlockModalOpen}
        onOk={() => void saveTemplateBlock()}
        onCancel={() => { setTemplateBlockModalOpen(false); templateBlockForm.resetFields(); setEditingTemplateBlock(null); }}
        confirmLoading={templateBlockSaving}
        width={isMobile ? "min(100%, 520px)" : 1040}
        styles={{ body: { maxHeight: "calc(100vh - 200px)", overflowY: "auto" } }}
        okText={editingTemplateBlock ? 'Enregistrer' : 'Créer'}
      >
        <Form form={templateBlockForm} layout="vertical" initialValues={{ variables: '', isPublic: true }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="Nom du bloc" rules={[{ required: true, message: 'Nom requis' }]}> 
                <Input placeholder="Ex: Signature entreprise" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="category" label="Catégorie" rules={[{ required: true, message: 'Catégorie requise' }]}>
                <Select placeholder="Sélectionner une catégorie">
                  <Select.Option value="header">En-tête</Select.Option>
                  <Select.Option value="content">Contenu</Select.Option>
                  <Select.Option value="cta">Call-to-action</Select.Option>
                  <Select.Option value="footer">Pied de page</Select.Option>
                  <Select.Option value="signature">Signature</Select.Option>
                  <Select.Option value="divider">Séparateur</Select.Option>
                  <Select.Option value="image">Image</Select.Option>
                  <Select.Option value="social">Réseaux sociaux</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="description" label="Description" rules={[{ max: 500 }]}>
                <Input placeholder="Description courte du bloc" />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" plain>
            <Space size={6}>
              <CodeOutlined />
              <span>Contenu HTML</span>
            </Space>
          </Divider>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Form.Item
                name="htmlContent"
                label="Éditeur visuel + HTML"
                rules={[
                  {
                    validator: async (_, v) => {
                      if (typeof v !== "string" || !v.trim()) {
                        throw new Error("Contenu HTML requis");
                      }
                    },
                  },
                ]}
                extra="Même éditeur double (Quill + Monaco) que pour les templates email."
              >
                <EmailHtmlDualEditor
                  monacoHeight={isMobile ? "240px" : "380px"}
                  quillHeight={isMobile ? 200 : 300}
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={10}>
              <Form.Item label={<Space><EyeOutlined /><span>Aperçu en direct</span></Space>}>
                <EmailHtmlLivePreview
                  html={typeof blockHtmlContentWatch === "string" ? blockHtmlContentWatch : ""}
                  emptyHtml={previewEmptyHtml}
                  minHeight={isMobile ? 180 : 260}
                  maxHeight={isMobile ? 260 : 380}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <EmailTemplateAiVariants form={templateBlockForm} mode="block" />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="variables"
                label="Variables"
                help="Liste séparée par des virgules. Vous pouvez aussi insérer {{prenom}}, {{entreprise}}, {{actu}}, {{custom}} dans le contenu."
              >
                <Input placeholder="prenom, entreprise" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="isPublic" valuePropName="checked">
                <Checkbox>Rendre ce bloc public (visible par tous les utilisateurs)</Checkbox>
              </Form.Item>
            </Col>
          </Row>
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
            key: "teams",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2f54eb" }} />
                Équipes
              </Space>
            ),
            children: <TeamsSection />,
          },
          {
            key: "pipeline-stages",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#08979c" }} />
                Pipeline (étapes)
              </Space>
            ),
            children: <PipelineStagesSection />,
          },
          {
            key: "permissions",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#eb2f96" }} />
                Rôles & permissions
              </Space>
            ),
            children: <PermissionsSection />,
          },
          {
            key: "security",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f5222d" }} />
                Sécurité (2FA)
              </Space>
            ),
            children: <SecuritySection />,
          },
          {
            key: "audit",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#595959" }} />
                Journal d&apos;activité
              </Space>
            ),
            children: <AuditLogsSection />,
          },
          {
            key: "system",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff7a45" }} />
                Système
              </Space>
            ),
            children: <SystemSection />,
          },
          {
            key: "webhooks",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fa541c" }} />
                Intégrations
              </Space>
            ),
            children: <WebhooksSection />,
          },
          {
            key: "rgpd",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#389e0d" }} />
                RGPD
              </Space>
            ),
            children: <RgpdSection />,
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
            key: "imap",
            label: (
              <Space>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#13c2c2" }} />
                IMAP / Réponses
              </Space>
            ),
            children: <ImapSection />,
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
