"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Form, Input, Button, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined, SafetyOutlined } from "@ant-design/icons";
import { AxiosError } from "axios";
import { api } from "@/lib/client";

const { Title, Text } = Typography;

// Page de connexion — POST /api/auth/login (email + mot de passe + code TOTP si 2FA).
export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
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
        setError(msg ?? "Connexion impossible.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", padding: "16px" }}>
      <Card style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 0 }}>CRM Lead Dashboard</Title>
          <Text type="secondary">Connexion</Text>
        </div>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" rules={[{ required: true, type: "email", message: "Email valide requis" }]}>
            <Input prefix={<UserOutlined />} placeholder="Email" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Mot de passe requis" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mot de passe" size="large" autoComplete="current-password" />
          </Form.Item>
          {needTotp && (
            <Form.Item name="totp" rules={[{ required: true, message: "Code 2FA requis" }]}>
              <Input prefix={<SafetyOutlined />} placeholder="Code 2FA" size="large" inputMode="numeric" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Se connecter
          </Button>
        </Form>
      </Card>
    </div>
  );
}
