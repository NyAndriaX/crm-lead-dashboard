"use client";

import { useCallback, useId, useState, type CSSProperties } from "react";
import {
  Alert,
  Button,
  Collapse,
  Divider,
  Input,
  Radio,
  Space,
  Typography,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd/es/form";
import { AxiosError } from "axios";
import { api } from "@/lib/client";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type Mode = "template" | "block";

type Variant = { label: string; subject?: string; bodyHtml: string };

type Notice = { kind: "success" | "warning" | "error" | "info"; text: string };

type TemplateGenerateResult = {
  mode: "template";
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  variables: string;
};

type BlockGenerateResult = {
  mode: "block";
  name: string;
  description: string;
  category: string;
  htmlContent: string;
  variables: string;
};

function parseVariables(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
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

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        fontWeight: 600,
        ...noticeStyle(notice.kind),
      }}
    >
      {notice.text}
    </div>
  );
}

export function EmailTemplateAiVariants({ form, mode }: { form: FormInstance; mode: Mode }) {
  const collapseKey = useId();
  const [genLoading, setGenLoading] = useState(false);
  const [varLoading, setVarLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [picked, setPicked] = useState<number>(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("");
  const [ctx, setCtx] = useState({
    prenom: "",
    entreprise: "",
    secteur: "",
    titre: "",
    actu: "",
    consigne: "",
  });

  const htmlField = mode === "template" ? "bodyHtml" : "htmlContent";

  function show(kind: Notice["kind"], text: string) {
    setNotice({ kind, text });
  }

  const generateFull = useCallback(async () => {
    const fromForm = mode === "template"
      ? String(form.getFieldValue("subject") ?? "").trim()
      : String(form.getFieldValue("description") ?? "").trim();
    const textBrief = brief.trim() || fromForm;
    if (!textBrief) {
      show(
        "warning",
        mode === "template"
          ? "Indiquez un sujet (champ Sujet ou brief ci-dessous) avant de générer."
          : "Décrivez le bloc (description ou brief ci-dessous) avant de générer.",
      );
      return;
    }

    setGenLoading(true);
    setNotice(null);
    try {
      const { data } = await api.post<{ data: TemplateGenerateResult | BlockGenerateResult }>(
        "/emailing/ai-generate",
        {
          mode,
          brief: textBrief,
          tone: tone.trim() || undefined,
          blockCategory: mode === "block" ? form.getFieldValue("category") : undefined,
        },
      );
      const result = data.data;
      if (result.mode === "template") {
        form.setFieldsValue({
          name: result.name,
          category: result.category,
          subject: result.subject,
          bodyHtml: result.bodyHtml,
          variables: result.variables,
        });
        show("success", "Template généré — vérifiez l’aperçu puis enregistrez.");
      } else {
        form.setFieldsValue({
          name: result.name,
          description: result.description,
          category: result.category,
          htmlContent: result.htmlContent,
          variables: result.variables,
        });
        show("success", "Bloc généré — vérifiez l’aperçu puis enregistrez.");
      }
      setVariants([]);
    } catch (e) {
      const ax = e as AxiosError<{ message?: string; error?: string }>;
      const code = ax.response?.data?.error;
      const msg = ax.response?.data?.message;
      if (code === "ai_disabled") {
        show("error", msg ?? "Configurez votre clé OpenAI dans Configuration → Intégration IA.");
      } else {
        show("error", msg ?? "Échec de la génération IA.");
      }
    } finally {
      setGenLoading(false);
    }
  }, [brief, form, mode, tone]);

  const generateVariants = useCallback(async () => {
    const bodyHtml = form.getFieldValue(htmlField);
    if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
      show(
        "warning",
        mode === "template"
          ? "Générez d’abord un template complet ou ajoutez un corps de message."
          : "Générez d’abord un bloc complet ou ajoutez du contenu HTML.",
      );
      return;
    }
    const variables = parseVariables(form.getFieldValue("variables"));
    const subject = mode === "template" ? String(form.getFieldValue("subject") ?? "").trim() : undefined;
    if (mode === "template" && !subject) {
      show("warning", "Renseignez un sujet avant de lancer les variantes.");
      return;
    }

    const leadContext = {
      prenom: ctx.prenom.trim() || undefined,
      entreprise: ctx.entreprise.trim() || undefined,
      secteur: ctx.secteur.trim() || undefined,
      titre: ctx.titre.trim() || undefined,
      actu: ctx.actu.trim() || undefined,
      consigne: ctx.consigne.trim() || undefined,
    };
    const hasCtx = Object.values(leadContext).some(Boolean);

    setVarLoading(true);
    setNotice(null);
    setVariants([]);
    try {
      const { data } = await api.post<{ data: { variants: Variant[] } }>("/emailing/ai-variants", {
        mode,
        subject: mode === "template" ? subject : undefined,
        bodyHtml,
        variables,
        leadContext: hasCtx ? leadContext : undefined,
      });
      const list = data.data?.variants ?? [];
      if (!list.length) {
        show("warning", "Aucune variante renvoyée.");
        return;
      }
      setVariants(list);
      setPicked(0);
      show("success", `${list.length} variante(s) générée(s).`);
    } catch (e) {
      const ax = e as AxiosError<{ message?: string; error?: string }>;
      show("error", ax.response?.data?.message ?? "Échec de la génération des variantes.");
    } finally {
      setVarLoading(false);
    }
  }, [ctx, form, htmlField, mode]);

  const applyVariant = useCallback(() => {
    const v = variants[picked];
    if (!v) return;
    if (mode === "template") {
      form.setFieldsValue({
        subject: v.subject ?? form.getFieldValue("subject"),
        bodyHtml: v.bodyHtml,
      });
    } else {
      form.setFieldsValue({ htmlContent: v.bodyHtml });
    }
    show("success", "Variante appliquée.");
    setVariants([]);
    setPicked(0);
  }, [form, mode, picked, variants]);

  return (
    <Collapse
      items={[
        {
          key: collapseKey,
          label: (
            <Space>
              <ThunderboltOutlined />
              <span>Assistant IA — génération & variantes</span>
            </Space>
          ),
          children: (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <NoticeBanner notice={notice} />

              <Alert
                type="info"
                showIcon
                message="Clé OpenAI requise"
                description={
                  <Paragraph style={{ marginBottom: 0 }} type="secondary">
                    Configurez votre clé dans <a href="/settings?tab=openai">Configuration → Intégration IA</a>.
                    La génération remplit directement les champs du formulaire — il vous suffit d&apos;enregistrer.
                  </Paragraph>
                }
              />

              <div>
                <Text strong>
                  {mode === "template" ? "1. Générer un template complet" : "1. Générer un bloc complet"}
                </Text>
                <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 13 }}>
                  {mode === "template"
                    ? "Décrivez le sujet ou l’objectif de l’email. L’IA remplit nom, catégorie, sujet, corps HTML et variables."
                    : "Décrivez le bloc souhaité (signature, CTA, en-tête…). L’IA remplit tous les champs."}
                </Paragraph>
                <TextArea
                  rows={2}
                  placeholder={
                    mode === "template"
                      ? "Ex : Premier contact B2B pour présenter notre solution SaaS de gestion de leads"
                      : "Ex : Signature professionnelle avec prénom, entreprise et lien Calendly"
                  }
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <Input
                  placeholder="Ton souhaité (facultatif) : direct, chaleureux, formel…"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={genLoading}
                  onClick={() => void generateFull()}
                >
                  {mode === "template" ? "Générer le template complet" : "Générer le bloc complet"}
                </Button>
              </div>

              <Divider style={{ margin: "8px 0" }} />

              <div>
                <Text strong>2. Variantes de ton (optionnel)</Text>
                <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 13 }}>
                  Une fois le contenu généré, proposez 2–3 reformulations de ton.
                </Paragraph>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Contexte lead (facultatif)</Text>
                  <Space wrap style={{ width: "100%", marginTop: 6 }}>
                    <Input
                      style={{ width: 120 }}
                      placeholder="Prénom"
                      value={ctx.prenom}
                      onChange={(e) => setCtx((c) => ({ ...c, prenom: e.target.value }))}
                    />
                    <Input
                      style={{ width: 160 }}
                      placeholder="Entreprise"
                      value={ctx.entreprise}
                      onChange={(e) => setCtx((c) => ({ ...c, entreprise: e.target.value }))}
                    />
                    <Input
                      style={{ width: 140 }}
                      placeholder="Secteur"
                      value={ctx.secteur}
                      onChange={(e) => setCtx((c) => ({ ...c, secteur: e.target.value }))}
                    />
                  </Space>
                </div>
                <Button
                  icon={<ThunderboltOutlined />}
                  loading={varLoading}
                  onClick={() => void generateVariants()}
                >
                  Générer 2–3 variantes
                </Button>
                {variants.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Radio.Group
                      style={{ display: "block" }}
                      value={picked}
                      onChange={(e) => setPicked(e.target.value)}
                    >
                      <Space direction="vertical">
                        {variants.map((v, i) => (
                          <Radio key={`${v.label}-${i}`} value={i}>
                            <Text>{v.label}</Text>
                            {mode === "template" && v.subject ? (
                              <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  Sujet : {v.subject}
                                </Text>
                              </div>
                            ) : null}
                          </Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                    <Button type="primary" style={{ marginTop: 12 }} onClick={applyVariant}>
                      Appliquer la variante
                    </Button>
                  </div>
                )}
              </div>
            </Space>
          ),
        },
      ]}
    />
  );
}
