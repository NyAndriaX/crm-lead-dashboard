"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Alert, Button, Card, Form, Input, List, Select, Space, Switch, Typography, Upload, message,
} from "antd";
import { ApiOutlined, CheckCircleOutlined, DeleteOutlined, FileMarkdownOutlined, ThunderboltOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { labelWithHelp } from "@/components/ui/FieldHelp";

type KnowledgeDoc = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};
const { Title, Text, Paragraph } = Typography;

type Notice = { kind: "success" | "warning" | "error" | "info"; text: string };

type ConfigState = {
  enabled: boolean;
  configured: boolean;
  model: string;
  autoResponderMode: string;
  autoResponderMeetingUrl: string | null;
  knowledgeText: string | null;
  knowledgeDocs: KnowledgeDoc[];
  knowledgeBaseId: string | null;
};

type UsageState = {
  monthTokens: number;
  monthRequestCount: number;
  totalTokens: number;
  monthCostUsd?: number;
  totalCostUsd?: number;
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
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<{ id: string; name: string }[]>([]);
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
        knowledgeBaseId: data.data.knowledgeBaseId ?? null,
        knowledgeText: data.data.knowledgeText ?? "",
        apiKey: "",
      });
      setKnowledgeDocs(data.data.knowledgeDocs ?? []);
      if (data.data.configured) {
        const u = await api.get<{ data: UsageState & { byFeature: { feature: string; tokens: number }[] } }>(
          "/me/openai-usage",
        );
        setUsage({
          monthTokens: u.data.data.monthTokens,
          monthRequestCount: u.data.data.monthRequestCount,
          totalTokens: u.data.data.totalTokens,
          monthCostUsd: u.data.data.monthCostUsd,
          totalCostUsd: u.data.data.totalCostUsd,
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
  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>("/knowledge-bases")
      .then((r) => setKnowledgeBases(r.data.data ?? []))
      .catch(() => {});
  }, []);

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    setNotice(null);
    try {
      const { data } = await api.put<{ data: ConfigState }>("/me/openai-config", {
        enabled: values.enabled,
        model: values.model,
        knowledgeBaseId: values.knowledgeBaseId || null,
        knowledgeText: values.knowledgeText?.trim() || null,
        knowledgeDocs,
        ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
      });
      setConfig(data.data);
      setKnowledgeDocs(data.data.knowledgeDocs ?? []);
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

  async function handleMdUpload(file: File): Promise<boolean> {
    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
      message.warning("Seuls les fichiers Markdown (.md) ou texte sont acceptés.");
      return false;
    }
    if (knowledgeDocs.length >= 10) {
      message.warning("Maximum 10 documents.");
      return false;
    }
    try {
      const content = await file.text();
      if (content.length > 8000) {
        message.warning("Document trop volumineux (max 8 000 caractères).");
        return false;
      }
      setKnowledgeDocs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.md$/i, ""),
          content: content.trim(),
          createdAt: new Date().toISOString(),
        },
      ]);
      message.success(`« ${file.name} » ajouté — enregistrez pour persister.`);
    } catch {
      message.error("Lecture du fichier impossible.");
    }
    return false;
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
            catégorisation des réponses — pour les actions que vous lancez ou dont vous êtes le créateur / assigné.
            L&apos;auto-répondeur se configure par campagne (Communication → Emailing).
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
              ({usage.monthRequestCount} appel{usage.monthRequestCount > 1 ? "s" : ""})
              {usage.monthCostUsd != null && (
                <> — <strong>${usage.monthCostUsd.toFixed(4)}</strong></>
              )}
              {" "}— total :{" "}
              <strong>{usage.totalTokens.toLocaleString("fr-FR")}</strong> tokens
              {usage.totalCostUsd != null && (
                <> (<strong>${usage.totalCostUsd.toFixed(4)}</strong>)</>
              )}.
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
        <Form.Item name="enabled" label={labelWithHelp("Activer l'IA pour mon compte", "Active toutes les fonctionnalités IA liées à votre compte : personnalisation des campagnes, briefs et variantes de templates.")} valuePropName="checked">
          <Switch checkedChildren="Oui" unCheckedChildren="Non" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label={labelWithHelp("Clé API OpenAI", "Votre clé personnelle sk-… depuis platform.openai.com. Elle est chiffrée en base et jamais réaffichée.")}
          extra="Format sk-… — obtenez-la sur platform.openai.com. Ne partagez jamais cette clé."
        >
          <Input.Password
            placeholder={config?.configured ? "•••••••• (laisser vide pour ne pas modifier)" : "sk-…"}
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item name="model" label={labelWithHelp("Modèle", "gpt-4o-mini est le plus économique ; gpt-4o offre une meilleure qualité pour les emails complexes.")}>
          <Select options={MODEL_OPTIONS} />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Auto-répondeur par campagne"
          description="Configurez l'auto-répondeur IA dans chaque campagne emailing (Communication → Emailing → modifier la campagne). La base de connaissances globale ci-dessous s'applique à toutes vos actions IA ; chaque campagne peut avoir sa propre base dédiée."
        />

        <Card
          size="small"
          title={
            <Space>
              <FileMarkdownOutlined />
              Base de connaissances IA
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 13 }}>
            Ajoutez du contexte métier (offres, argumentaire, ton, FAQ). L&apos;IA s&apos;en sert pour
            personnaliser les emails, les relances et les réponses inbox (en complément des bases par campagne ou séquence).
          </Paragraph>
          <Form.Item
            name="knowledgeBaseId"
            label={labelWithHelp("Base de connaissances par défaut (inbox / réponses)", "Utilisée pour les réponses IA de l'inbox lorsqu'aucune base campagne n'est définie. Gérée dans Configuration → Bases de connaissances.")}
          >
            <Select
              allowClear
              placeholder="Choisir une base…"
              options={knowledgeBases.map((kb) => ({ value: kb.id, label: kb.name }))}
            />
          </Form.Item>
          <Form.Item
            name="knowledgeText"
            label={labelWithHelp("Consignes et texte libre", "Pitch, objections fréquentes, prix indicatifs, ton à adopter… Collez ici tout ce que l'IA doit connaître.")}
          >
            <Input.TextArea rows={5} placeholder="Ex : Nous proposons une solution SaaS B2B pour… Ton : professionnel et direct. Ne jamais promettre de délais inférieurs à 2 semaines." />
          </Form.Item>
          <Space style={{ marginBottom: 12 }}>
            <Upload
              accept=".md,text/markdown,text/plain"
              showUploadList={false}
              beforeUpload={(file) => { void handleMdUpload(file); return false; }}
            >
              <Button icon={<UploadOutlined />}>Importer un fichier .md</Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>Max 10 fichiers · 8 000 car. chacun</Text>
          </Space>
          {knowledgeDocs.length > 0 && (
            <List
              size="small"
              bordered
              dataSource={knowledgeDocs}
              renderItem={(doc) => (
                <List.Item
                  actions={[
                    <Button
                      key="del"
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => setKnowledgeDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                    >
                      Retirer
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={doc.name}
                    description={`${doc.content.length.toLocaleString("fr-FR")} caractères · ${new Date(doc.createdAt).toLocaleDateString("fr-FR")}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

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
