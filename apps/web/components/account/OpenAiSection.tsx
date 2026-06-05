"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Alert, Button, Card, Form, Input, Select, Space, Switch, Typography,
} from "antd";
import { ApiOutlined, CheckCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
const { Title, Text, Paragraph } = Typography;

type Notice = { kind: "success" | "warning" | "error" | "info"; text: string };

type ConfigState = {
  enabled: boolean;
  configured: boolean;
  model: string;
};

type UsageState = {
  monthTokens: number;
  monthRequestCount: number;
  totalTokens: number;
};

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini (recommandé)" },
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  { value: "gpt-4.1", label: "gpt-4.1" },
];

export function OpenAiSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [form] = Form.useForm();

  function show(kind: Notice["kind"], text: string) {
    setNotice({ kind, text });
  }

  function noticeStyle(kind: Notice["kind"]): CSSProperties {
    switch (kind) {
      case "success":
        return { background: "#f6ffed", border: "1px solid #b7eb8f", color: "#389e0d" };
      case "warning":
        return { background: "#fffbeb", border: "1px solid #ffe58f", color: "#ad6800" };
      case "error":
        return { background: "#fff1f0", border: "1px solid #ffa39e", color: "#cf1322" };
      default:
        return { background: "#e6f7ff", border: "1px solid #91d5ff", color: "#1677ff" };
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: ConfigState }>("/me/openai-config");
      setConfig(data.data);
      form.setFieldsValue({
        enabled: data.data.enabled,
        model: data.data.model,
        apiKey: "",
      });
      if (data.data.configured) {
        const u = await api.get<{ data: UsageState & { byFeature: { feature: string; tokens: number }[] } }>(
          "/me/openai-usage",
        );
        setUsage({
          monthTokens: u.data.data.monthTokens,
          monthRequestCount: u.data.data.monthRequestCount,
          totalTokens: u.data.data.totalTokens,
        });
      } else {
        setUsage(null);
      }
    } catch {
      show("error", "Impossible de charger la configuration OpenAI.");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.put<{ data: ConfigState }>("/me/openai-config", {
        enabled: values.enabled,
        model: values.model,
        ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
      });
      setConfig(data.data);
      form.setFieldValue("apiKey", "");
      show("success", "Configuration OpenAI enregistrée.");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      show("error", msg ?? "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.put<{ data: ConfigState }>("/me/openai-config", { clearApiKey: true });
      setConfig(data.data);
      form.setFieldsValue({ enabled: false, apiKey: "" });
      show("success", "Clé OpenAI supprimée.");
    } catch {
      show("error", "Échec de la suppression.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setNotice(null);
    try {
      await save();
      const { data } = await api.post<{ data: { ok: boolean; message: string } }>("/me/openai-config/test");
      if (data.data.ok) {
        show("success", data.data.message);
      } else {
        show("warning", data.data.message);
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      show("error", msg ?? "Test impossible.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card loading={loading} style={{ borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.06)" }}>
      <Space align="start" size={16} style={{ width: "100%", marginBottom: 16 }}>
        <ThunderboltOutlined style={{ fontSize: 32, color: "#722ed1" }} />
        <div>
          <Title level={4} style={{ margin: 0 }}>Intégration OpenAI</Title>
          <Text type="secondary">
            Chaque utilisateur utilise sa propre clé API. Elle est chiffrée en base et n&apos;est jamais affichée après enregistrement.
          </Text>
        </div>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Fonctionnalités concernées"
        description={
          <span>
            Variantes IA dans les templates, brief de qualification des leads, personnalisation des campagnes et relances,
            catégorisation des réponses et auto-répondeur — pour les actions que vous lancez ou dont vous êtes le créateur / assigné.
          </span>
        }
      />

      {notice ? (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            fontWeight: 600,
            ...noticeStyle(notice.kind),
          }}
        >
          {notice.text}
        </div>
      ) : null}

      {config?.configured && usage ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Consommation"
          description={
            <span>
              Ce mois : <strong>{usage.monthTokens.toLocaleString("fr-FR")}</strong> tokens
              ({usage.monthRequestCount} appel{usage.monthRequestCount > 1 ? "s" : ""}) — total :{" "}
              <strong>{usage.totalTokens.toLocaleString("fr-FR")}</strong> tokens.
              Détail sur le tableau de bord.
            </span>
          }
        />
      ) : null}

      {config?.configured ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 16 }}
          message="Clé enregistrée"
          description={`Modèle actif : ${config.model}. Laissez le champ clé vide pour conserver la clé existante.`}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Aucune clé configurée"
          description="Sans clé, les fonctionnalités IA utilisent un mode de repli (texte par variables ou heuristiques)."
        />
      )}

      <Form form={form} layout="vertical" initialValues={{ enabled: false, model: "gpt-4o-mini" }}>
        <Form.Item name="enabled" label="Activer l'IA pour mon compte" valuePropName="checked">
          <Switch checkedChildren="Oui" unCheckedChildren="Non" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="Clé API OpenAI"
          extra="Format sk-… — obtenez-la sur platform.openai.com. Ne partagez jamais cette clé."
        >
          <Input.Password
            placeholder={config?.configured ? "•••••••• (laisser vide pour ne pas modifier)" : "sk-…"}
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item name="model" label="Modèle">
          <Select options={MODEL_OPTIONS} />
        </Form.Item>
        <Space wrap>
          <Button type="primary" icon={<ApiOutlined />} loading={saving} onClick={() => void save()}>
            Enregistrer
          </Button>
          <Button loading={testing} onClick={() => void testConnection()}>
            Tester la connexion
          </Button>
          {config?.configured ? (
            <Button danger loading={saving} onClick={() => void clearKey()}>
              Supprimer la clé
            </Button>
          ) : null}
        </Space>
      </Form>

      <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
        La clé n&apos;est plus lue depuis les variables d&apos;environnement du serveur : chaque collaborateur configure la sienne ici.
      </Paragraph>
    </Card>
  );
}
