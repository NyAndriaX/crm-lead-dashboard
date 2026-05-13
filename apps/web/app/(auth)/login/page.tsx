"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Form, Input, Button, Typography, Alert, Tag, Space, Divider, message } from "antd";
import {
  UserOutlined, LockOutlined, SafetyOutlined, ThunderboltFilled, RocketFilled,
  LineChartOutlined, TeamOutlined, MailOutlined, CopyOutlined,
} from "@ant-design/icons";
import { AxiosError } from "axios";
import { api } from "@/lib/client";
import { useIsMobile } from "@/lib/responsive";

const { Title, Text, Paragraph } = Typography;

const DEMO_ACCOUNTS = [
  { role: "Admin",      email: "admin@crm.local",          color: "red" },
  { role: "Manager",    email: "manager@crm.local",        color: "orange" },
  { role: "Commercial", email: "lucas.bernard@crm.local",  color: "blue" },
  { role: "Lecteur",    email: "lecteur@crm.local",        color: "default" },
] as const;
const DEMO_PASSWORD = "ChangeMe!2026";

const FEATURES = [
  { icon: <TeamOutlined />,      label: "Gestion centralisée des leads B2B" },
  { icon: <LineChartOutlined />, label: "Scoring & pipeline temps réel" },
  { icon: <MailOutlined />,      label: "Campagnes email + tracking IMAP" },
  { icon: <ThunderboltFilled />, label: "Imports CSV / XLSX en arrière-plan" },
];

// Page de connexion — POST /api/auth/login (email + mot de passe + code TOTP si 2FA).
export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needTotp, setNeedTotp] = useState(false);

  async function onFinish(values: { email: string; password: string; totp?: string }) {
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/login", values);
      router.replace(params.get("next") || "/dashboard");
      router.refresh();
    } catch (e) {
      const code = (e as AxiosError<{ error?: string; message?: string }>).response?.data?.error;
      const msg = (e as AxiosError<{ message?: string }>).response?.data?.message;
      if (code === "totp_required") {
        setNeedTotp(true);
        setError("Saisissez votre code 2FA.");
      } else {
        setError(msg ?? "Connexion impossible. Vérifiez vos identifiants.");
      }
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(email: string) {
    form.setFieldsValue({ email, password: DEMO_PASSWORD });
    setError(null);
    setNeedTotp(false);
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      message.success("Copié dans le presse-papiers");
    } catch {
      message.error("Impossible de copier");
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "#f5f7fb",
      }}
    >
      {/* ── Brand panel (gauche, masqué sur mobile) ── */}
      {!isMobile && (
        <div
          style={{
            flex: "1 1 50%",
            position: "relative",
            background:
              "linear-gradient(135deg,#0f1c4f 0%,#1d39c4 45%,#1677ff 100%)",
            color: "#fff",
            padding: "56px 56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          {/* Décor : cercles flous */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -120,
              right: -120,
              width: 360,
              height: 360,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              filter: "blur(40px)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              bottom: -160,
              left: -100,
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: "rgba(82,196,26,0.12)",
              filter: "blur(60px)",
            }}
          />

          {/* Logo + tagline */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <Space size={12} align="center">
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.25)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <RocketFilled style={{ fontSize: 22, color: "#fff" }} />
              </div>
              <div>
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
                  CRM Lead
                </Text>
                <div>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
                    Dashboard
                  </Text>
                </div>
              </div>
            </Space>
          </div>

          {/* Pitch + features */}
          <div style={{ position: "relative", zIndex: 1, maxWidth: 520 }}>
            <Title level={1} style={{ color: "#fff", fontSize: 44, lineHeight: 1.15, marginBottom: 16, fontWeight: 700 }}>
              Pilotez votre acquisition B2B en un seul écran.
            </Title>
            <Paragraph style={{ color: "rgba(255,255,255,0.78)", fontSize: 16, marginBottom: 32 }}>
              Centralisez vos leads, scorez automatiquement les opportunités, lancez des
              campagnes email et suivez la performance commerciale en temps réel.
            </Paragraph>

            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              {FEATURES.map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: "rgba(255,255,255,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 14,
                    }}
                  >
                    {f.icon}
                  </div>
                  <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>{f.label}</Text>
                </div>
              ))}
            </Space>
          </div>

          {/* Footer brand */}
          <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              © {new Date().getFullYear()} CRM Lead Dashboard
            </Text>
            <Space size={16}>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>RGPD-ready</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>v0.2.0</Text>
            </Space>
          </div>
        </div>
      )}

      {/* ── Form panel (droite) ── */}
      <div
        style={{
          flex: isMobile ? "1 1 100%" : "1 1 50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "32px 16px" : "48px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Header mobile : logo compact */}
          {isMobile && (
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: "linear-gradient(135deg,#1d39c4,#1677ff)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 12, boxShadow: "0 8px 24px rgba(22,119,255,0.25)",
                }}
              >
                <RocketFilled style={{ fontSize: 26, color: "#fff" }} />
              </div>
              <Title level={3} style={{ margin: 0 }}>CRM Lead Dashboard</Title>
              <Text type="secondary">Pilotez vos leads B2B en un seul écran</Text>
            </div>
          )}

          <Card
            bordered={false}
            style={{
              boxShadow: isMobile ? "none" : "0 12px 40px rgba(15,28,79,0.08)",
              borderRadius: 16,
              background: isMobile ? "transparent" : "#fff",
            }}
            bodyStyle={{ padding: isMobile ? 0 : 32 }}
          >
            <div style={{ marginBottom: 24 }}>
              <Title level={3} style={{ marginBottom: 4 }}>Bon retour parmi nous</Title>
              <Text type="secondary">Connectez-vous à votre espace de travail.</Text>
            </div>

            {error && (
              <Alert
                type="error"
                message={error}
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: 16 }}
              />
            )}

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              requiredMark={false}
              size="large"
            >
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, type: "email", message: "Email valide requis" }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: "#bfbfbf" }} />}
                  placeholder="vous@entreprise.com"
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                name="password"
                label={
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <span>Mot de passe</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <a style={{ color: "#1677ff" }} onClick={(e) => { e.preventDefault(); message.info("Contactez l'administrateur pour réinitialiser."); }} href="#">
                        Mot de passe oublié ?
                      </a>
                    </Text>
                  </div>
                }
                rules={[{ required: true, message: "Mot de passe requis" }]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: "#bfbfbf" }} />}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Form.Item>

              {needTotp && (
                <Form.Item
                  name="totp"
                  label="Code 2FA"
                  rules={[{ required: true, message: "Code 2FA requis" }]}
                >
                  <Input
                    prefix={<SafetyOutlined style={{ color: "#bfbfbf" }} />}
                    placeholder="6 chiffres"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </Form.Item>
              )}

              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                style={{
                  height: 48,
                  fontWeight: 600,
                  borderRadius: 10,
                  background: "linear-gradient(135deg,#1d39c4,#1677ff)",
                  border: 0,
                  boxShadow: "0 4px 12px rgba(22,119,255,0.25)",
                }}
              >
                Se connecter
              </Button>
            </Form>

            {/* ── Comptes de démo ── */}
            <Divider plain style={{ margin: "28px 0 16px", color: "#8c8c8c", fontSize: 12 }}>
              <ThunderboltFilled style={{ color: "#faad14", marginRight: 6 }} />
              Comptes de démonstration
            </Divider>

            <div
              style={{
                background: "#fafbff",
                border: "1px dashed #d6e4ff",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <div
                    key={acc.email}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 8,
                      transition: "background 0.15s",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f5ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => fillDemo(acc.email)}
                  >
                    <Space size={8} style={{ minWidth: 0, flex: 1 }}>
                      <Tag color={acc.color} style={{ margin: 0, minWidth: 78, textAlign: "center" }}>
                        {acc.role}
                      </Tag>
                      <Text style={{ fontSize: 12, color: "#262626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {acc.email}
                      </Text>
                    </Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined style={{ color: "#8c8c8c" }} />}
                      onClick={(e) => { e.stopPropagation(); void copyToClipboard(acc.email); }}
                    />
                  </div>
                ))}
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 8,
                    borderTop: "1px solid #e6f4ff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Space size={6}>
                    <LockOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Mot de passe : <Text code style={{ fontSize: 12 }}>{DEMO_PASSWORD}</Text>
                    </Text>
                  </Space>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined style={{ color: "#8c8c8c" }} />}
                    onClick={() => void copyToClipboard(DEMO_PASSWORD)}
                  />
                </div>
              </Space>
            </div>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Connexion sécurisée · Cookies httpOnly · 2FA TOTP supporté
              </Text>
            </div>
          </Card>

          {/* Footer mobile */}
          {isMobile && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                © {new Date().getFullYear()} CRM Lead Dashboard · v0.2.0
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
