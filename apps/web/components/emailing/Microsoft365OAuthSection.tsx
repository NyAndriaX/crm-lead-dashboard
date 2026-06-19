"use client";

/**
 * Microsoft365OAuthSection — workflow OAuth device code en 4 étapes.
 * Permet de connecter IMAP (réception) et SMTP (envoi) via OAuth Microsoft 365
 * sans mot de passe, en parallèle des configs classiques existantes.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Card, Steps, Form, Input, Button, Alert, Tag, Select, Typography,
  Space, Divider, Row, Col, Tooltip, Badge, Modal, Spin,
} from "antd";
import {
  WindowsOutlined, KeyOutlined, QrcodeOutlined, CheckCircleOutlined,
  LinkOutlined, CopyOutlined, SafetyCertificateOutlined, LoadingOutlined,
  InboxOutlined, MailOutlined, DisconnectOutlined, InfoCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { validateAzureClientSecret } from "@/lib/oauth/microsoftSchemas";
import { extractApiError, notifyApiError, notifySuccess } from "@/lib/feedback";

const { Title, Text, Paragraph } = Typography;

type Target = "imap" | "smtp";
type SetupMode = "outlook" | "existing";

type AzureCreds = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
};

type ConfigOption = { id: string; label: string; hasOauth: boolean };

type Step = "credentials" | "device" | "consent" | "save";

type Props = {
  imapConfigs: ConfigOption[];
  smtpConfigs: ConfigOption[];
  onRefresh: () => void;
};

const WIZARD_STORAGE_KEY = "crm_ms365_oauth_wizard";

const STEP_ITEMS = [
  {
    title: "App Azure",
    description: "Identifiants",
    icon: <KeyOutlined />,
  },
  {
    title: "Code d'appareil",
    description: "Génération",
    icon: <QrcodeOutlined />,
  },
  {
    title: "Consentement",
    description: "Connexion Microsoft",
    icon: <WindowsOutlined />,
  },
  {
    title: "Connexion",
    description: "Sauvegarde",
    icon: <CheckCircleOutlined />,
  },
];

const REQUIRED_PERMS = [
  { name: "SMTP.Send", type: "Delegated", usage: "Envoi emails" },
  { name: "IMAP.AccessAsUser.All", type: "Delegated", usage: "Réception emails" },
  { name: "offline_access", type: "Delegated", usage: "Refresh token" },
  { name: "User.Read", type: "Delegated", usage: "Identité" },
];

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function Microsoft365OAuthSection({ imapConfigs, smtpConfigs, onRefresh }: Props) {
  const [step, setStep] = useState<Step>("credentials");
  const [setupMode, setSetupMode] = useState<SetupMode>("outlook");
  const [target, setTarget] = useState<Target>("imap");
  const [configId, setConfigId] = useState<string>("");
  const [form] = Form.useForm();

  const [deviceCode, setDeviceCode] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
  } | null>(null);
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string | null } | null>(null);
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [revokeModal, setRevokeModal] = useState<{ configId: string; target: Target; label: string } | null>(null);
  const [azureCreds, setAzureCreds] = useState<AzureCreds | null>(null);
  const clientSecretRef = useRef("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        azureCreds?: AzureCreds;
        deviceCode?: typeof deviceCode;
        step?: Step;
      };
      if (saved.azureCreds) {
        setAzureCreds(saved.azureCreds);
        clientSecretRef.current = saved.azureCreds.clientSecret ?? "";
        form.setFieldsValue({
          tenantId: saved.azureCreds.tenantId,
          clientId: saved.azureCreds.clientId,
          clientSecret: saved.azureCreds.clientSecret ?? "",
          mailbox: saved.azureCreds.mailbox,
        });
      }
      if (saved.deviceCode) setDeviceCode(saved.deviceCode);
      if (saved.step) setStep(saved.step);
    } catch {
      /* ignore */
    }
  }, [form]);

  function persistWizard(patch: {
    azureCreds?: AzureCreds | null;
    deviceCode?: typeof deviceCode;
    step?: Step;
  }) {
    try {
      const prev = JSON.parse(sessionStorage.getItem(WIZARD_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
      sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch {
      /* ignore */
    }
  }

  function resolveClientSecret(): string {
    const fromForm = String(form.getFieldValue("clientSecret") ?? "").trim();
    return fromForm || clientSecretRef.current || azureCreds?.clientSecret?.trim() || "";
  }

  function buildCredsForApi(requireSecret = false): AzureCreds | null {
    if (!azureCreds) return null;
    const clientSecret = resolveClientSecret();
    if (requireSecret && !clientSecret) return null;
    return { ...azureCreds, clientSecret };
  }

  const currentStep = step === "credentials" ? 0 : step === "device" ? 1 : step === "consent" ? 2 : 3;
  const configs = target === "imap" ? imapConfigs : smtpConfigs;

  const reset = useCallback(() => {
    setStep("credentials");
    setDeviceCode(null);
    setTokens(null);
    setPolling(false);
    setLoading(false);
    setError(null);
    setSaved(false);
    setConfigId("");
    setSetupMode("outlook");
    setAzureCreds(null);
    clientSecretRef.current = "";
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
    form.resetFields();
  }, [form]);

  async function handleStep1() {
    try {
      const values = await form.validateFields(["tenantId", "clientId", "mailbox"]);
      if (setupMode === "existing" && !configId) {
        setError("Sélectionnez un compte IMAP ou SMTP existant, ou choisissez « Nouveau compte Outlook ».");
        return;
      }
      const creds: AzureCreds = {
        tenantId: String(values.tenantId).trim(),
        clientId: String(values.clientId).trim(),
        clientSecret: String(values.clientSecret ?? "").trim(),
        mailbox: String(values.mailbox).trim(),
      };
      clientSecretRef.current = creds.clientSecret;
      setAzureCreds(creds);
      persistWizard({ azureCreds: creds, step: "device" });
      setError(null);
      setStep("device");
    } catch {
      /* validation antd */
    }
  }

  async function generateDeviceCode() {
    const creds = buildCredsForApi();
    if (!creds?.tenantId || !creds?.clientId) {
      setError("Identifiants Azure manquants — revenez à l'étape 1 et validez à nouveau.");
      return;
    }
    const secretErr = validateAzureClientSecret(creds.clientSecret, creds.clientId);
    if (secretErr) {
      setError(secretErr);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{
        data: { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
      }>("/oauth/microsoft/device-code", creds);
      const dc = {
        userCode: data.data.user_code,
        verificationUri: data.data.verification_uri,
        deviceCode: data.data.device_code,
        expiresIn: data.data.expires_in,
        interval: data.data.interval,
      };
      setDeviceCode(dc);
      form.setFieldsValue({ clientSecret: creds.clientSecret });
      persistWizard({ azureCreds: creds, deviceCode: dc, step: "consent" });
      setStep("consent");
    } catch (e) {
      setError(extractApiError(e, "Erreur lors de la génération du code Microsoft"));
      notifyApiError(e, "Erreur lors de la génération du code Microsoft");
    } finally {
      setLoading(false);
    }
  }

  async function pollToken() {
    if (!deviceCode || !azureCreds) return;
    const fromForm = String(form.getFieldValue("clientSecret") ?? "").trim();
    const clientSecret = fromForm || resolveClientSecret();
    const secretErr = validateAzureClientSecret(clientSecret, azureCreds.clientId);
    if (secretErr) {
      setError(secretErr);
      return;
    }
    const creds: AzureCreds = { ...azureCreds, clientSecret };
    clientSecretRef.current = clientSecret;
    persistWizard({ azureCreds: creds });
    setPolling(true);
    setError(null);
    try {
      const { data } = await api.post<{
        data: { accessToken: string; refreshToken: string | null };
      }>("/oauth/microsoft/poll", {
        tenantId: creds.tenantId,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        deviceCode: deviceCode.deviceCode,
        interval: deviceCode.interval,
      });
      setTokens(data.data);
      setStep("save");
    } catch (e) {
      setError(extractApiError(e, "Consentement en attente ou expiré."));
      notifyApiError(e, "Consentement en attente ou expiré.");
    } finally {
      setPolling(false);
    }
  }

  async function saveTokens() {
    if (!tokens?.refreshToken) {
      setError("Aucun refresh token reçu — assurez-vous que offline_access est accordé.");
      return;
    }
    const creds = buildCredsForApi(false);
    if (!creds) {
      setError("Identifiants Azure manquants — recommencez le workflow.");
      return;
    }
    const secretErr = validateAzureClientSecret(creds.clientSecret, creds.clientId);
    if (secretErr) {
      setError(secretErr);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/oauth/microsoft/save", {
        mode: setupMode === "outlook" ? "outlook" : target,
        ...(setupMode === "existing" ? { configId } : {}),
        tenantId: creds.tenantId,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        refreshToken: tokens.refreshToken,
        mailbox: creds.mailbox,
      });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      setSaved(true);
      notifySuccess(
        "Connexion OAuth active",
        setupMode === "outlook"
          ? "Réception IMAP et envoi SMTP Outlook sont configurés via Microsoft 365."
          : "Le compte est connecté via OAuth Microsoft 365.",
      );
      onRefresh();
    } catch (e) {
      setError(extractApiError(e, "Erreur de sauvegarde"));
      notifyApiError(e, "Erreur de sauvegarde");
    } finally {
      setLoading(false);
    }
  }

  async function revokeOauth() {
    if (!revokeModal) return;
    try {
      await api.post("/oauth/microsoft/revoke", { target: revokeModal.target, configId: revokeModal.configId });
      setRevokeModal(null);
      onRefresh();
    } catch (e) {
      notifyApiError(e, "Impossible de révoquer la connexion OAuth");
    }
  }

  const allWithOauth = [
    ...imapConfigs.filter((c) => c.hasOauth).map((c) => ({ ...c, targetType: "imap" as Target })),
    ...smtpConfigs.filter((c) => c.hasOauth).map((c) => ({ ...c, targetType: "smtp" as Target })),
  ];

  return (
    <Card
      style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
      styles={{ body: { padding: 0 } }}
    >
      {/* ── En-tête ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0078d4 0%, #0050a0 100%)",
          borderRadius: "12px 12px 0 0",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <WindowsOutlined style={{ fontSize: 22, color: "#fff" }} />
        </div>
        <div>
          <Title level={5} style={{ color: "#fff", margin: 0 }}>Microsoft 365 — OAuth 2.0</Title>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
            Connexion sécurisée sans mot de passe — Envoi (SMTP) + Réception (IMAP)
          </Text>
        </div>
        {allWithOauth.length > 0 && (
          <Badge
            count={allWithOauth.length}
            style={{ background: "#52c41a", marginLeft: "auto" }}
            title={`${allWithOauth.length} compte(s) connecté(s)`}
          />
        )}
      </div>

      <div style={{ padding: 24 }}>

        {/* ── Comptes déjà connectés ── */}
        {allWithOauth.length > 0 && (
          <>
            <div style={{ marginBottom: 20 }}>
              <Text strong style={{ fontSize: 13 }}>Comptes OAuth actifs</Text>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {allWithOauth.map((c) => (
                  <Tag
                    key={`${c.targetType}-${c.id}`}
                    icon={c.targetType === "imap" ? <InboxOutlined /> : <MailOutlined />}
                    color="blue"
                    style={{ borderRadius: 6, padding: "4px 10px", fontSize: 12 }}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setRevokeModal({ configId: c.id, target: c.targetType, label: c.label });
                    }}
                  >
                    {c.label} ({c.targetType === "imap" ? "IMAP" : "SMTP"})
                  </Tag>
                ))}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── Prérequis Azure ── */}
        <div
          style={{
            background: "#f6f8ff",
            border: "1px solid #d6e4ff",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 24,
          }}
        >
          <Space align="start">
            <InfoCircleOutlined style={{ color: "#1677ff", fontSize: 15, marginTop: 2 }} />
            <div>
              <Text strong style={{ fontSize: 13, color: "#1677ff" }}>Prérequis Azure Portal</Text>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {REQUIRED_PERMS.map((p) => (
                  <Tooltip key={p.name} title={p.usage}>
                    <Tag color="geekblue" style={{ borderRadius: 4, fontSize: 11 }}>
                      {p.name}
                    </Tag>
                  </Tooltip>
                ))}
              </div>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 6 }}>
                App registrations → API permissions → Toutes en <strong>Delegated</strong> → Grant admin consent
              </Text>
            </div>
          </Space>
        </div>

        {/* ── Steps ── */}
        <Steps
          current={currentStep}
          size="small"
          items={STEP_ITEMS}
          style={{ marginBottom: 28 }}
        />

        {/* ── Étape 0 : Identifiants ── */}
        {step === "credentials" && (
          <Form form={form} layout="vertical">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Connexion Outlook sans IMAP/SMTP manuel"
              description="Choisissez « Nouveau compte Outlook » : le CRM créera automatiquement la réception (IMAP) et l'envoi (SMTP) via OAuth Microsoft 365."
            />
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  label={<Text strong>Mode de connexion</Text>}
                  required
                >
                  <Select
                    value={setupMode}
                    onChange={(v: SetupMode) => {
                      setSetupMode(v);
                      setConfigId("");
                    }}
                    options={[
                      {
                        value: "outlook",
                        label: "Nouveau compte Outlook (IMAP + SMTP)",
                      },
                      {
                        value: "existing",
                        label: "Lier un compte IMAP ou SMTP existant",
                        disabled: imapConfigs.length === 0 && smtpConfigs.length === 0,
                      },
                    ]}
                  />
                </Form.Item>
              </Col>
              {setupMode === "existing" && (
                <Col xs={24} sm={12}>
                  <Form.Item
                    label={<Text strong>Compte existant</Text>}
                    required
                  >
                    <Space.Compact style={{ width: "100%" }}>
                      <Select
                        value={target}
                        onChange={(v) => { setTarget(v); setConfigId(""); }}
                        style={{ width: 120 }}
                        options={[
                          { value: "imap", label: <><InboxOutlined /> IMAP</> },
                          { value: "smtp", label: <><MailOutlined /> SMTP</> },
                        ]}
                      />
                      <Select
                        placeholder="Choisir un compte"
                        value={configId || undefined}
                        onChange={setConfigId}
                        style={{ flex: 1 }}
                        options={configs.map((c) => ({
                          value: c.id,
                          label: (
                            <Space>
                              {c.label}
                              {c.hasOauth && <Tag color="blue" style={{ fontSize: 10 }}>OAuth</Tag>}
                            </Space>
                          ),
                        }))}
                      />
                    </Space.Compact>
                  </Form.Item>
                </Col>
              )}
              <Col xs={24} sm={12}>
                <Form.Item
                  name="mailbox"
                  label={<Text strong>Adresse email</Text>}
                  rules={[{ required: true, type: "email", message: "Email requis" }]}
                  tooltip="La boîte Microsoft 365 à connecter (ex. adam.mehdi@datalia.app)"
                >
                  <Input placeholder="utilisateur@datalia.app" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  name="tenantId"
                  label={<Text strong>Tenant ID</Text>}
                  rules={[{ required: true, message: "Requis" }]}
                  tooltip="Azure Portal → Azure Active Directory → Overview → Tenant ID"
                >
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name="clientId"
                  label={<Text strong>Client ID (Application ID)</Text>}
                  rules={[{ required: true, message: "Requis" }]}
                  tooltip="Azure Portal → App registrations → votre app → Application (client) ID"
                >
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item
                  name="clientSecret"
                  label={<Text strong>Client Secret (optionnel)</Text>}
                  tooltip="Laissez vide si Azure autorise les flux client public. Renseignez-le seulement pour une app confidentielle / Web."
                  extra="Optionnel avec « Allow public client flows ». Si vous utilisez un secret, copiez sa Valeur, pas l'ID du secret ni le Client ID."
                >
                  <Input.Password placeholder="Valeur du secret (optionnel si flux client public)" autoComplete="off" />
                </Form.Item>
              </Col>
            </Row>

            {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

            <Button type="primary" icon={<KeyOutlined />} onClick={handleStep1} size="large" block>
              Valider et continuer
            </Button>
          </Form>
        )}

        {/* ── Étape 1 : Générer le device code ── */}
        {step === "device" && (
          <Space direction="vertical" style={{ width: "100%" }} size={16}>
            <Alert
              type="info"
              showIcon
              icon={<QrcodeOutlined />}
              message="Génération du code d'accès"
              description="Le CRM va demander un code unique à Microsoft. Vous devrez ensuite vous connecter avec votre compte Microsoft 365 dans votre navigateur."
            />
            {error && <Alert type="error" message={error} showIcon />}
            <Row gutter={12}>
              <Col flex={1}>
                <Button onClick={() => setStep("credentials")} block>Retour</Button>
              </Col>
              <Col flex={2}>
                <Button
                  type="primary"
                  icon={loading ? <LoadingOutlined /> : <QrcodeOutlined />}
                  loading={loading}
                  onClick={generateDeviceCode}
                  size="large"
                  block
                  style={{ background: "#0078d4", borderColor: "#0078d4" }}
                >
                  Générer le code Microsoft
                </Button>
              </Col>
            </Row>
          </Space>
        )}

        {/* ── Étape 2 : Consentement ── */}
        {step === "consent" && deviceCode && (
          <Space direction="vertical" style={{ width: "100%" }} size={16}>
            {/* Encadré principal avec le code */}
            <div
              style={{
                background: "linear-gradient(135deg, #f0f7ff 0%, #e6f0ff 100%)",
                border: "2px solid #0078d4",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
              }}
            >
              <SafetyCertificateOutlined style={{ fontSize: 32, color: "#0078d4", marginBottom: 8 }} />
              <Paragraph style={{ margin: "0 0 8px", color: "#555" }}>
                Ouvrez ce lien dans votre navigateur :
              </Paragraph>
              <Space size={8} style={{ marginBottom: 16 }}>
                <a
                  href={deviceCode.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 14, fontWeight: 600, color: "#0078d4" }}
                >
                  <LinkOutlined /> {deviceCode.verificationUri}
                </a>
                <Tooltip title="Copier le lien">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(deviceCode.verificationUri)}
                  />
                </Tooltip>
              </Space>

              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 12,
                  background: "#fff", border: "2px dashed #0078d4",
                  borderRadius: 10, padding: "12px 24px",
                }}
              >
                <Text style={{ fontSize: 13, color: "#666" }}>Code :</Text>
                <Text
                  style={{
                    fontSize: 28, fontWeight: 900, letterSpacing: 6,
                    color: "#0078d4", fontFamily: "monospace",
                  }}
                >
                  {deviceCode.userCode}
                </Text>
                <Tooltip title="Copier le code">
                  <Button
                    icon={<CopyOutlined />}
                    size="small"
                    onClick={() => copyToClipboard(deviceCode.userCode)}
                  />
                </Tooltip>
              </div>

              <Paragraph style={{ margin: "16px 0 0", color: "#888", fontSize: 12 }}>
                Expire dans ~{Math.round(deviceCode.expiresIn / 60)} minutes — connectez-vous avec{" "}
                <strong>{azureCreds?.mailbox ?? "votre compte"}</strong>
              </Paragraph>
            </div>

            {/* Instructions étape par étape */}
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #f0f0f0",
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <Text strong style={{ fontSize: 13 }}>Étapes à suivre :</Text>
              <div style={{ marginTop: 10 }}>
                {[
                  { num: "1", text: `Ouvrez ${deviceCode.verificationUri} dans votre navigateur` },
                  { num: "2", text: `Entrez le code : ${deviceCode.userCode}` },
                  { num: "3", text: `Connectez-vous avec ${azureCreds?.mailbox ?? "votre compte"}` },
                  { num: "4", text: "Acceptez les permissions (SMTP.Send, IMAP, offline_access…)" },
                  { num: "5", text: 'Revenez ici et cliquez "Vérifier le consentement"' },
                ].map((item) => (
                  <div key={item.num} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "#0078d4", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}
                    >
                      {item.num}
                    </div>
                    <Text style={{ fontSize: 13, lineHeight: "22px" }}>{item.text}</Text>
                  </div>
                ))}
              </div>
            </div>

            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 4 }}
              message="Client Secret"
              description={
                <>
                  Si votre app Azure a <strong>Flux client public</strong> activé (Authentication → Paramètres avancés),
                  laissez le secret vide et cliquez directement sur Vérifier.
                  Sinon, collez la <strong>Valeur</strong> du secret (pas l&apos;ID du secret, format UUID).
                </>
              }
            />

            <Form form={form} layout="vertical">
              <Form.Item
                name="clientSecret"
                label={<Text strong>Client Secret Azure (optionnel)</Text>}
                extra="Laissez vide si « Allow public client flows » est activé. Pour une app Web/confidentielle, collez la Valeur du secret, pas un UUID."
              >
                <Input.Password placeholder="Laisser vide si flux client public activé" autoComplete="off" />
              </Form.Item>
            </Form>

            {error && <Alert type="error" message={error} showIcon />}

            <Row gutter={12}>
              <Col flex={1}>
                <Button onClick={() => setStep("device")} block>Retour</Button>
              </Col>
              <Col flex={2}>
                <Button
                  type="primary"
                  icon={polling ? <Spin size="small" /> : <CheckCircleOutlined />}
                  loading={polling}
                  onClick={() => void pollToken()}
                  size="large"
                  block
                  style={{ background: "#0078d4", borderColor: "#0078d4" }}
                >
                  Vérifier le consentement
                </Button>
              </Col>
            </Row>
          </Space>
        )}

        {/* ── Étape 3 : Sauvegarde ── */}
        {step === "save" && (
          <Space direction="vertical" style={{ width: "100%" }} size={16}>
            {!saved ? (
              <>
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message="Consentement Microsoft reçu"
                  description={
                    tokens?.refreshToken
                      ? "Le refresh token a été obtenu. Cliquez sur Sauvegarder pour activer la connexion OAuth."
                      : "Access token reçu mais pas de refresh token — vérifiez que offline_access est accordé."
                  }
                />
                {!tokens?.refreshToken && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    message="Refresh token manquant"
                    description={
                      <>
                        Ajoutez <Tag color="orange">offline_access</Tag> dans les permissions Azure et relancez le workflow.
                      </>
                    }
                  />
                )}
                {error && <Alert type="error" message={error} showIcon />}
                <Row gutter={12}>
                  <Col flex={1}>
                    <Button onClick={reset} block icon={<DisconnectOutlined />}>Recommencer</Button>
                  </Col>
                  <Col flex={2}>
                    <Button
                      type="primary"
                      icon={loading ? <LoadingOutlined /> : <SafetyCertificateOutlined />}
                      loading={loading}
                      onClick={saveTokens}
                      size="large"
                      block
                      disabled={!tokens?.refreshToken}
                      style={{ background: "#52c41a", borderColor: "#52c41a" }}
                    >
                      Sauvegarder la connexion OAuth
                    </Button>
                  </Col>
                </Row>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a", marginBottom: 12 }} />
                <div>
                  <Title level={5} style={{ margin: "0 0 6px", color: "#52c41a" }}>Connexion OAuth active !</Title>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    {setupMode === "outlook"
                      ? "Réception (IMAP) et envoi (SMTP) Outlook sont configurés via OAuth Microsoft 365."
                      : target === "imap"
                        ? "Le worker IMAP utilisera maintenant OAuth Microsoft 365 pour recevoir les emails."
                        : "Les envois SMTP utiliseront maintenant OAuth Microsoft 365 (plus besoin de mot de passe)."}
                  </Paragraph>
                </div>
                <Button style={{ marginTop: 20 }} onClick={reset}>Connecter un autre compte</Button>
              </div>
            )}
          </Space>
        )}
      </div>

      {/* ── Modal révocation ── */}
      <Modal
        open={!!revokeModal}
        onCancel={() => setRevokeModal(null)}
        onOk={revokeOauth}
        okText="Révoquer"
        okButtonProps={{ danger: true }}
        title={
          <Space>
            <DisconnectOutlined style={{ color: "#ff4d4f" }} />
            Révoquer la connexion OAuth
          </Space>
        }
      >
        <Paragraph>
          Êtes-vous sûr de vouloir révoquer la connexion OAuth Microsoft de{" "}
          <strong>{revokeModal?.label}</strong> ({revokeModal?.target === "imap" ? "IMAP" : "SMTP"}) ?
        </Paragraph>
        <Alert
          type="warning"
          showIcon
          message="Le compte reviendra au mode mot de passe classique. Le token sera supprimé de la base."
        />
      </Modal>
    </Card>
  );
}
