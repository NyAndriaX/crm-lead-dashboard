"use client";

/**
 * Section Sécurité (U-04) — wizard 2FA TOTP pour le user courant.
 *
 * États :
 *  - 2FA inactive : bouton "Activer la 2FA" → demande mot de passe, génère QR + secret,
 *    user scanne, saisit un code, on valide → activée.
 *  - 2FA active : bouton "Désactiver" → demande mot de passe + code, on désactive.
 */
import { useEffect, useState } from "react";
import {
  Alert, Button, Card, Form, Input, message, Modal, Result, Space, Steps, Typography,
  QRCode,
} from "antd";
import {
  CheckCircleOutlined, LockOutlined, SafetyOutlined, WarningOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type MeResponse = {
  user: { id: string; name: string; email: string; role: string; twoFactorOn?: boolean };
};

export function SecuritySection() {
  const [loading, setLoading] = useState(true);
  const [twoFactorOn, setTwoFactorOn] = useState(false);
  const [email, setEmail] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [passwordForm] = Form.useForm();
  const [codeForm] = Form.useForm();
  const [disableForm] = Form.useForm();

  async function fetchMe() {
    setLoading(true);
    try {
      const { data } = await api.get<MeResponse>("/auth/me");
      setTwoFactorOn(Boolean(data.user.twoFactorOn));
      setEmail(data.user.email);
    } catch {
      message.error("Impossible de charger votre profil.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchMe(); }, []);

  function openSetup() {
    setStep(0);
    setOtpauthUrl(null);
    setSecret(null);
    passwordForm.resetFields();
    codeForm.resetFields();
    setSetupOpen(true);
  }

  async function startSetup() {
    const { password } = await passwordForm.validateFields();
    setBusy(true);
    try {
      const { data } = await api.post<{ data: { secret: string; otpauthUrl: string } }>(
        "/auth/2fa/setup",
        { password },
      );
      setSecret(data.data.secret);
      setOtpauthUrl(data.data.otpauthUrl);
      setStep(1);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    const { code } = await codeForm.validateFields();
    setBusy(true);
    try {
      await api.post("/auth/2fa/verify", { code });
      setStep(2);
      setTwoFactorOn(true);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function disable2fa() {
    const values = await disableForm.validateFields();
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", values);
      message.success("2FA désactivée");
      setTwoFactorOn(false);
      setDisableOpen(false);
      disableForm.resetFields();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card loading={loading}>
        <Space align="start" size={16} style={{ width: "100%" }}>
          <SafetyOutlined style={{ fontSize: 36, color: twoFactorOn ? "#34d399" : "#fbbf24" }} />
          <div style={{ flex: 1 }}>
            <Title level={4} style={{ margin: 0 }}>
              Authentification à deux facteurs (2FA)
              {twoFactorOn ? (
                <Text style={{ color: "#34d399", fontSize: 14, marginLeft: 12 }}>
                  <CheckCircleOutlined /> Activée
                </Text>
              ) : (
                <Text style={{ color: "#fbbf24", fontSize: 14, marginLeft: 12 }}>
                  <WarningOutlined /> Inactive
                </Text>
              )}
            </Title>
            <Paragraph type="secondary" style={{ marginTop: 8 }}>
              La 2FA renforce la sécurité de votre compte en exigeant un code temporaire
              généré par une application (Google Authenticator, 1Password, Authy, etc.)
              à chaque connexion, en plus du mot de passe.
            </Paragraph>
            <Space>
              {!twoFactorOn ? (
                <Button type="primary" icon={<SafetyOutlined />} onClick={openSetup}>
                  Activer la 2FA
                </Button>
              ) : (
                <Button danger onClick={() => setDisableOpen(true)}>
                  Désactiver la 2FA
                </Button>
              )}
            </Space>
          </div>
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Vous avez perdu votre téléphone ?"
        description="Demandez à un administrateur de réinitialiser votre 2FA depuis l'onglet Utilisateurs. Cela désactive la 2FA et force une nouvelle connexion."
      />

      {/* Wizard activation */}
      <Modal
        title={<Space><SafetyOutlined /><span>Activer la 2FA</span></Space>}
        open={setupOpen}
        onCancel={() => setSetupOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Steps
          current={step}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: "Identification" },
            { title: "Scanner le QR" },
            { title: "Terminé" },
          ]}
        />

        {step === 0 && (
          <Form form={passwordForm} layout="vertical">
            <Paragraph type="secondary">
              Confirmez votre mot de passe pour démarrer l'enrôlement.
            </Paragraph>
            <Form.Item name="password" label="Mot de passe actuel" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} autoFocus />
            </Form.Item>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={() => setSetupOpen(false)}>Annuler</Button>
              <Button type="primary" onClick={() => void startSetup()} loading={busy}>
                Continuer
              </Button>
            </Space>
          </Form>
        )}

        {step === 1 && otpauthUrl && secret && (
          <div>
            <Paragraph>
              Scannez ce QR code avec votre application d'authentification, puis saisissez
              le code à 6 chiffres affiché.
            </Paragraph>
            <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
              <QRCode value={otpauthUrl} size={200} />
            </div>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              Vous ne pouvez pas scanner ? Saisissez ce code manuellement dans votre app :
              <br />
              <Text code copyable style={{ fontSize: 13, marginTop: 6, display: "inline-block" }}>
                {secret}
              </Text>
            </Paragraph>
            <Form form={codeForm} layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item
                name="code"
                label="Code à 6 chiffres"
                rules={[
                  { required: true, message: "Code requis" },
                  { pattern: /^\d{6,10}$/, message: "Format invalide" },
                ]}
              >
                <Input placeholder="123456" maxLength={10} autoFocus />
              </Form.Item>
              <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                <Button onClick={() => setSetupOpen(false)}>Annuler</Button>
                <Button type="primary" onClick={() => void confirmCode()} loading={busy}>
                  Activer
                </Button>
              </Space>
            </Form>
          </div>
        )}

        {step === 2 && (
          <Result
            status="success"
            title="2FA activée"
            subTitle={`À votre prochaine connexion sur ${email}, un code 2FA sera demandé.`}
            extra={
              <Button type="primary" onClick={() => setSetupOpen(false)}>
                Fermer
              </Button>
            }
          />
        )}
      </Modal>

      {/* Désactivation */}
      <Modal
        title="Désactiver la 2FA"
        open={disableOpen}
        onCancel={() => setDisableOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message="Votre compte sera moins sécurisé"
          style={{ marginBottom: 16 }}
        />
        <Form form={disableForm} layout="vertical">
          <Form.Item name="password" label="Mot de passe actuel" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="code"
            label="Code 2FA actuel"
            rules={[
              { required: true, message: "Code requis" },
              { pattern: /^\d{6,10}$/, message: "Format invalide" },
            ]}
          >
            <Input placeholder="123456" maxLength={10} />
          </Form.Item>
          <Space style={{ width: "100%", justifyContent: "flex-end" }}>
            <Button onClick={() => setDisableOpen(false)}>Annuler</Button>
            <Button danger onClick={() => void disable2fa()} loading={busy}>
              Désactiver la 2FA
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
