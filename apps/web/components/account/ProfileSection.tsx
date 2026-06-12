"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form, Input, Space, Typography } from "antd";
import { EditOutlined, UserOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Title, Text } = Typography;

type ProfileState = {
  name: string;
  email: string;
};

export function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ user: ProfileState }>("/auth/me");
      setProfile({ name: data.user.name, email: data.user.email });
      form.setFieldsValue({ name: data.user.name });
    } catch (e) { notifyApiError(e, "Impossible de charger le profil."); } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const { data } = await api.patch<{ data: { name: string } }>("/me/profile", {
        name: values.name.trim(),
      });
      notifySuccess("Profil mis à jour.");
      setProfile((p) => (p ? { ...p, name: data.data.name } : p));
      window.location.reload();
    } catch (e: unknown) {
      notifyApiError(e, "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card loading={loading} title={<Space><UserOutlined /><span>Profil</span></Space>}>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Modifiez le nom affiché dans l&apos;application (menu, tableau de bord, assignations).
      </Text>
      <Form form={form} layout="vertical" onFinish={() => void save()}>
        <Form.Item
          name="name"
          label="Nom affiché"
          rules={[
            { required: true, message: "Indiquez un nom" },
            { max: 120, message: "120 caractères maximum" },
          ]}
        >
          <Input prefix={<EditOutlined />} placeholder="Votre nom" />
        </Form.Item>
        <Form.Item label="Email">
          <Input value={profile?.email ?? ""} disabled />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          Enregistrer
        </Button>
      </Form>
    </Card>
  );
}
