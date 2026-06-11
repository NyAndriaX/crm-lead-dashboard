"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Form, Input, Button, Typography, Alert, message } from "antd";
import { LockOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Paragraph, Text } = Typography;

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [loading, setLoading] = useState(false);

  async function onFinish(values: { password: string; confirm: string }) {
    if (values.password !== values.confirm) {
      message.error("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password: values.password });
      message.success("Mot de passe mis à jour.");
      router.replace("/login");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg ?? "Lien invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <Alert type="error" message="Lien invalide" description="Demandez un nouveau lien depuis la page mot de passe oublié." />;
  }

  return (
    <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
      <Form.Item name="password" label="Nouveau mot de passe" rules={[{ required: true, min: 8 }]}>
        <Input.Password prefix={<LockOutlined />} />
      </Form.Item>
      <Form.Item name="confirm" label="Confirmer" rules={[{ required: true, min: 8 }]}>
        <Input.Password prefix={<LockOutlined />} />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>Enregistrer</Button>
    </Form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f5f7fb" }}>
      <Card style={{ width: "100%", maxWidth: 420, borderRadius: 16 }}>
        <Link href="/login"><Button type="text" icon={<ArrowLeftOutlined />} style={{ marginBottom: 8 }}>Connexion</Button></Link>
        <Title level={3} style={{ marginTop: 0 }}>Nouveau mot de passe</Title>
        <Paragraph type="secondary">Choisissez un mot de passe d'au moins 8 caractères.</Paragraph>
        <Suspense fallback={<Text type="secondary">Chargement…</Text>}>
          <ResetPasswordInner />
        </Suspense>
      </Card>
    </div>
  );
}
