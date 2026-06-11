"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Form, Input, Button, Typography, Alert, message } from "antd";
import { MailOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onFinish(values: { email: string }) {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", values);
      setSent(true);
      message.success("Email envoyé si le compte existe.");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg ?? "Impossible d'envoyer l'email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f5f7fb" }}>
      <Card style={{ width: "100%", maxWidth: 420, borderRadius: 16 }}>
        <Link href="/login"><Button type="text" icon={<ArrowLeftOutlined />} style={{ marginBottom: 8 }}>Retour</Button></Link>
        <Title level={3} style={{ marginTop: 0 }}>Mot de passe oublié</Title>
        <Paragraph type="secondary">
          Saisissez votre email professionnel. Si un compte existe, vous recevrez un lien de réinitialisation (valable 1 h).
        </Paragraph>
        {sent ? (
          <Alert type="success" showIcon message="Demande enregistrée" description="Vérifiez votre boîte mail (et les spams)." />
        ) : (
          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
              <Input prefix={<MailOutlined />} placeholder="vous@entreprise.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Envoyer le lien</Button>
          </Form>
        )}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Connexion sécurisée · SMTP requis côté admin</Text>
        </div>
      </Card>
    </div>
  );
}
