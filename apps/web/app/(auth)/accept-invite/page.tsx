"use client";

/**
 * Page publique d'acceptation d'invitation utilisateur (U-01).
 *
 * Reçoit ?token=... via query string, demande à l'utilisateur de définir son
 * mot de passe, appelle POST /api/users/accept-invite, puis redirige.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Form, Input, Button, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import axios, { type AxiosError } from "axios";
import { palette } from "@/lib/theme";
import { BrandMark } from "@/components/ui/Brand";
import { ProspectorRobot } from "@/components/ui/ProspectorRobot";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/** Robustesse indicative : longueur, casse, chiffres, symboles. */
function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: "Faible", color: palette.red };
  if (s <= 3) return { score: s, label: "Correct", color: palette.amber };
  return { score: s, label: "Solide", color: palette.green };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nb-glass nb-gradient-border nb-fade-up" style={{ width: "100%", maxWidth: 440, borderRadius: 26, padding: 34 }}>
      {children}
    </div>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pw, setPw] = useState("");
  const st = strength(pw);

  async function onFinish(values: { password: string; confirm: string }) {
    if (values.password !== values.confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!token) {
      setError("Aucun token reçu — vérifiez le lien.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/users/accept-invite", { token, password: values.password });
      setDone(true);
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 800);
    } catch (e) {
      const resp = (e as AxiosError<{ message?: string; error?: string }>).response;
      setError(resp?.data?.message ?? "Impossible d'accepter l'invitation. Le lien est peut-être expiré.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><ProspectorRobot state="error" size={110} /></div>
        <Alert type="error" showIcon message="Lien d'invitation invalide" description="Aucun jeton n'a été fourni : ouvrez le lien reçu par email, ou demandez une nouvelle invitation à votre administrateur." />
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <ProspectorRobot state={done ? "success" : loading ? "scanning" : error ? "error" : "idle"} size={92} />
        <div>
          <div className="nb-eyebrow">Invitation</div>
          <div className="nb-display" style={{ fontSize: 24, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.15 }}>
            Bienvenue sur <span className="nb-gradient-text">CRM Lead</span>
          </div>
        </div>
      </div>
      <div style={{ color: "var(--nb-text-2)", fontSize: 14, lineHeight: 1.6, margin: "8px 0 18px" }}>
        Choisissez le mot de passe qui protégera votre compte (8 caractères minimum).
      </div>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {done && <Alert type="success" showIcon message="Compte activé — redirection vers votre tableau de bord…" style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={onFinish} disabled={loading || done} requiredMark={false}>
        <Form.Item
          label="Mot de passe"
          name="password"
          rules={[
            { required: true, message: "Veuillez choisir un mot de passe" },
            { min: 8, message: "Minimum 8 caractères" },
            { max: 128, message: "Maximum 128 caractères" },
          ]}
          extra={
            pw ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < st.score ? st.color : "var(--nb-border-strong)", transition: "background .25s" }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: st.color, fontWeight: 600 }}>{st.label}</span>
              </div>
            ) : null
          }
        >
          <Input.Password size="large" prefix={<LockOutlined />} placeholder="Mot de passe" autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
        </Form.Item>
        <Form.Item label="Confirmation" name="confirm" rules={[{ required: true, message: "Veuillez confirmer le mot de passe" }]}>
          <Input.Password size="large" prefix={<LockOutlined />} placeholder="Confirmer le mot de passe" autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" loading={loading} block>
          Activer mon compte
        </Button>
      </Form>
    </Shell>
  );
}

export default function AcceptInvitePage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 22, position: "relative" }}>
      <div style={{ position: "absolute", top: 20, right: 20 }}><ThemeToggle /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="nb-fade-up">
        <BrandMark size={36} />
        <span className="nb-display" style={{ fontWeight: 700, fontSize: 18, color: "var(--nb-text-strong)" }}>CRM Lead</span>
      </div>
      <Suspense fallback={<Shell><div style={{ color: "var(--nb-text-2)" }}>Chargement…</div></Shell>}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
