"use client";

/**
 * Page publique d'acceptation d'invitation utilisateur (U-01).
 *
 * Reçoit ?token=... via query string, demande à l'utilisateur de définir son
 * mot de passe, appelle POST /api/users/accept-invite, puis redirige.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Form, Input, Button, Alert, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { type AxiosError } from "axios";
import { api } from "@/lib/client";
import { notifyApiError } from "@/lib/feedback";

const { Title, Paragraph } = Typography;

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
      await api.post("/users/accept-invite", { token, password: values.password });
      setDone(true);
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 800);
    } catch (e) {
      const resp = (e as AxiosError<{ message?: string; error?: string }>).response;
      const msg = resp?.data?.message ?? "Impossible d'accepter l'invitation. Le lien est peut-être expiré.";
      setError(msg);
      notifyApiError(e, msg);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card style={{ width: 420 }}>
        <Alert type="error" message="Lien invalide" description="Aucun token n'a été fourni dans l'URL." />
      </Card>
    );
  }

  return (
    <Card style={{ width: 420 }}>
      <Title level={3} style={{ marginTop: 0 }}>Bienvenue sur le CRM</Title>
      <Paragraph type="secondary">
        Choisissez le mot de passe qui sécurisera votre compte. Au moins 8 caractères.
      </Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {done && <Alert type="success" showIcon message="Compte activé — redirection…" style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={onFinish} disabled={loading || done}>
        <Form.Item
          label="Mot de passe"
          name="password"
          rules={[
            { required: true, message: "Veuillez choisir un mot de passe" },
            { min: 8, message: "Minimum 8 caractères" },
            { max: 128, message: "Maximum 128 caractères" },
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Mot de passe" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="Confirmation"
          name="confirm"
          rules={[{ required: true, message: "Veuillez confirmer le mot de passe" }]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Confirmer" autoComplete="new-password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Activer mon compte
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f5f7fb 0%, #e8eef9 100%)",
        padding: 24,
      }}
    >
      <Suspense fallback={<Card style={{ width: 420 }}><div>Chargement…</div></Card>}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
