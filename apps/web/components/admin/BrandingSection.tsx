"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form, Input, Space, Typography, Upload, message } from "antd";
import { BgColorsOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Paragraph } = Typography;

type Branding = { siteName?: string; siteIconUrl?: string };

export function BrandingSection() {
  const [form] = Form.useForm<Branding>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Branding }>("/organization/branding");
      form.setFieldsValue(data.data);
    } catch {
      message.error("Impossible de charger l'identité visuelle.");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.put("/organization/branding", values);
      message.success("Identité enregistrée — rechargez la page pour voir le changement.");
    } catch {
      message.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card loading={loading}>
      <Space align="start" style={{ marginBottom: 16 }}>
        <BgColorsOutlined style={{ fontSize: 28, color: "#1677ff" }} />
        <div>
          <Title level={5} style={{ margin: 0 }}>Identité du site</Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Personnalisez le nom et l'icône affichés en haut à gauche du tableau de bord.
          </Paragraph>
        </div>
      </Space>
      <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
        <Form.Item name="siteName" label="Nom du site">
          <Input placeholder="CRM Lead Dashboard" />
        </Form.Item>
        <Form.Item name="siteIconUrl" label="URL ou image (data URL)">
          <Input placeholder="https://… ou uploadez une image" />
        </Form.Item>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = () => form.setFieldValue("siteIconUrl", String(reader.result ?? ""));
            reader.readAsDataURL(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>Uploader une icône</Button>
        </Upload>
        <Button type="primary" onClick={() => void save()} loading={saving} style={{ marginTop: 16 }}>
          Enregistrer
        </Button>
      </Form>
    </Card>
  );
}
