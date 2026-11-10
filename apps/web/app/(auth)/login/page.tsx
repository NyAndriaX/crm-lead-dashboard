"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Form, Input, Button, Alert, Space, Tooltip, message } from "antd";
import {
  UserOutlined, LockOutlined, SafetyOutlined, RadarChartOutlined, ThunderboltOutlined,
  MailOutlined, FunnelPlotOutlined, CopyOutlined, ArrowRightOutlined,
} from "@ant-design/icons";
import { AxiosError } from "axios";
import { api } from "@/lib/client";
import { useIsMobile } from "@/lib/responsive";
import { palette } from "@/lib/theme";
import { ProspectorRobot, type RobotState } from "@/components/ui/ProspectorRobot";
import { AIBadge, BrandMark } from "@/components/ui/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@crm.local", color: palette.pink },
  { role: "Manager", email: "manager@crm.local", color: palette.amber },
  { role: "Commercial", email: "lucas.bernard@crm.local", color: palette.cyan },
  { role: "Lecteur", email: "lecteur@crm.local", color: palette.textSecondary },
] as const;

const DEMO_PASSWORD = "ChangeMe!2026";

// Le bloc "Comptes de démonstration" n'est affiché que si explicitement
// activé (NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=true). Masqué par défaut → jamais
// visible en production. Inlined au build par Next.js.
const SHOW_DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true";

const FEATURES = [
  { icon: <RadarChartOutlined />, title: "Robot de prospection", text: "Google Maps exploré, sites visités, décideurs identifiés." },
  { icon: <ThunderboltOutlined />, title: "Qualification par l'IA", text: "Chaque entreprise analysée et notée selon votre cible." },
  { icon: <MailOutlined />, title: "Campagnes personnalisées", text: "Un email unique par prospect, relances et réponses triées." },
  { icon: <FunnelPlotOutlined />, title: "Pipeline & analytics", text: "Scoring, Kanban et indicateurs en temps réel." },
];

// Page de connexion — POST /api/auth/login (email + mot de passe + code TOTP si 2FA).
function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needTotp, setNeedTotp] = useState(false);
  const [robot, setRobot] = useState<RobotState>("idle");

  async function onFinish(values: { email: string; password: string; totp?: string }) {
    setLoading(true);
    setError(null);
    setRobot("scanning");
    try {
      await api.post("/auth/login", values);
      setRobot("success");
      router.replace(params.get("next") || "/dashboard");
      router.refresh();
    } catch (e) {
      const code = (e as AxiosError<{ error?: string; message?: string }>).response?.data?.error;
      const msg = (e as AxiosError<{ message?: string }>).response?.data?.message;
      if (code === "totp_required") {
        setNeedTotp(true);
        setRobot("idle");
        setError("Saisissez votre code 2FA.");
      } else {
        setRobot("error");
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
    setRobot("idle");
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      message.success("Copié dans le presse-papiers");
    } catch {
      message.error("Impossible de copier");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "stretch", padding: isMobile ? 16 : 28, gap: 28, position: "relative" }}>
      <div style={{ position: "absolute", top: isMobile ? 16 : 28, right: isMobile ? 16 : 28, zIndex: 2 }}>
        <ThemeToggle />
      </div>
      {/* ── Panneau de marque ── */}
      {!isMobile && (
        <div style={{ flex: "1 1 55%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px 28px", position: "relative" }}>
          <Space size={12} align="center" className="nb-fade-up">
            <BrandMark size={42} />
            <div style={{ lineHeight: 1.1 }}>
              <div className="nb-display" style={{ fontSize: 20, fontWeight: 700, color: "var(--nb-text-strong)" }}>CRM Lead</div>
              <div style={{ fontSize: 10, letterSpacing: "0.24em", color: palette.textTertiary, textTransform: "uppercase" }}>AI Prospecting Platform</div>
            </div>
          </Space>

          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ maxWidth: 560 }} className="nb-stagger">
              <div><AIBadge>Propulsé par l'IA</AIBadge></div>
              <h1 className="nb-display" style={{ fontSize: 56, lineHeight: 1.02, fontWeight: 700, color: "var(--nb-text-strong)", margin: "20px 0 18px" }}>
                La prospection B2B, <span className="nb-gradient-text">pilotée par l&apos;IA.</span>
              </h1>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: palette.textSecondary, margin: 0 }}>
                Décrivez votre client idéal : le robot trouve les entreprises, identifie les décideurs,
                qualifie chaque opportunité et lance des campagnes personnalisées.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 30 }}>
                {FEATURES.map((f) => (
                  <div key={f.title} className="nb-glass nb-lift" style={{ borderRadius: 16, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--nb-text-strong)", fontWeight: 600, fontSize: 14 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", background: palette.gradientSoft, color: palette.cyan }}>
                        {f.icon}
                      </span>
                      {f.title}
                    </div>
                    <div style={{ color: palette.textTertiary, fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{f.text}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="nb-fade-up" style={{ flexShrink: 0, animationDelay: "0.3s" }}>
              <ProspectorRobot state={robot === "idle" ? "scanning" : robot} size={240} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", color: palette.textTertiary, fontSize: 12 }}>
            <span>© {new Date().getFullYear()} CRM Lead</span>
            <span>RGPD · Données chiffrées AES-256 · 2FA</span>
          </div>
        </div>
      )}

      {/* ── Formulaire ── */}
      <div style={{ flex: "1 1 45%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="nb-glass nb-gradient-border nb-fade-up" style={{ width: "100%", maxWidth: 440, borderRadius: 26, padding: isMobile ? 26 : 38 }}>
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <ProspectorRobot state={robot} size={120} />
            </div>
          )}
          <div className="nb-eyebrow">Espace sécurisé</div>
          <h2 className="nb-display" style={{ fontSize: 30, fontWeight: 700, color: "var(--nb-text-strong)", margin: "8px 0 6px" }}>Bon retour</h2>
          <div style={{ color: palette.textSecondary, marginBottom: 26 }}>Connectez-vous pour retrouver votre centre de prospection.</div>

          {error && <Alert type={needTotp ? "info" : "error"} showIcon message={error} style={{ marginBottom: 18 }} />}

          <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish} size="large" onValuesChange={() => robot === "error" && setRobot("idle")}>
            <Form.Item name="email" label="Email" rules={[{ required: true, message: "Email requis" }, { type: "email", message: "Email invalide" }]}>
              <Input prefix={<UserOutlined style={{ color: palette.textTertiary }} />} placeholder="vous@entreprise.com" autoComplete="email" />
            </Form.Item>
            <Form.Item
              name="password"
              label={
                <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  Mot de passe
                </span>
              }
              rules={[{ required: true, message: "Mot de passe requis" }]}
              extra={
                <a style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); message.info("Contactez l'administrateur pour réinitialiser."); }} href="#">
                  Mot de passe oublié ?
                </a>
              }
            >
              <Input.Password prefix={<LockOutlined style={{ color: palette.textTertiary }} />} placeholder="••••••••" autoComplete="current-password" />
            </Form.Item>
            {needTotp && (
              <Form.Item name="totp" label="Code 2FA" rules={[{ required: true, len: 6, message: "6 chiffres" }]}>
                <Input prefix={<SafetyOutlined style={{ color: palette.textTertiary }} />} placeholder="123456" maxLength={6} autoFocus />
              </Form.Item>
            )}
            <Button type="primary" htmlType="submit" block loading={loading} icon={<ArrowRightOutlined />} iconPosition="end" style={{ height: 50, marginTop: 6 }}>
              {loading ? "Vérification…" : "Se connecter"}
            </Button>
          </Form>

          <div style={{ marginTop: 18, textAlign: "center", color: palette.textTertiary, fontSize: 12 }}>
            <SafetyOutlined /> Connexion chiffrée · cookies HttpOnly · 2FA TOTP
          </div>

          {SHOW_DEMO_ACCOUNTS && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--nb-border)" }}>
              <div className="nb-eyebrow" style={{ marginBottom: 10 }}>Comptes de démonstration</div>
              <div style={{ display: "grid", gap: 6 }}>
                {DEMO_ACCOUNTS.map((a) => (
                  <div
                    key={a.email}
                    onClick={() => fillDemo(a.email)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px",
                      borderRadius: 12, cursor: "pointer", background: "rgba(148,163,184,0.06)", border: "1px solid var(--nb-border)",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: a.color, width: 80 }}>{a.role}</span>
                    <span className="nb-mono" style={{ fontSize: 12, color: palette.textSecondary, flex: 1 }}>{a.email}</span>
                    <Tooltip title="Copier l'email">
                      <CopyOutlined style={{ color: palette.textTertiary }} onClick={(e) => { e.stopPropagation(); void copyToClipboard(a.email); }} />
                    </Tooltip>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: palette.textTertiary }}>
                Mot de passe : <span className="nb-mono">{DEMO_PASSWORD}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
