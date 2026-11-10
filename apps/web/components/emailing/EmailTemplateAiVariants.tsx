"use client";

import { useCallback, useId, useState } from "react";
import {
  Alert,
  Button,
  Collapse,
  Input,
  Radio,
  Space,
  Typography,
  message,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd/es/form";
import { AxiosError } from "axios";
import { api } from "@/lib/client";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type Mode = "template" | "block";

type Variant = { label: string; subject?: string; bodyHtml: string };

function parseVariables(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function EmailTemplateAiVariants({ form, mode }: { form: FormInstance; mode: Mode }) {
  const collapseKey = useId();
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [picked, setPicked] = useState<number>(0);
  const [ctx, setCtx] = useState({
    prenom: "",
    entreprise: "",
    secteur: "",
    titre: "",
    actu: "",
    consigne: "",
  });

  const htmlField = mode === "template" ? "bodyHtml" : "htmlContent";

  const generate = useCallback(async () => {
    const bodyHtml = form.getFieldValue(htmlField);
    if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
      message.warning(
        mode === "template"
          ? "Ajoutez d’abord un corps de message (brouillon suffit)."
          : "Ajoutez d’abord du contenu HTML au bloc.",
      );
      return;
    }
    const variables = parseVariables(form.getFieldValue("variables"));
    const subject = mode === "template" ? String(form.getFieldValue("subject") ?? "").trim() : undefined;
    if (mode === "template" && !subject) {
      message.warning("Renseignez un sujet (même provisoire) avant de lancer l’IA.");
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

    setLoading(true);
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
        message.warning("Aucune variante renvoyée.");
        return;
      }
      setVariants(list);
      setPicked(0);
      message.success(`${list.length} variante(s) générée(s).`);
    } catch (e) {
      const ax = e as AxiosError<{ message?: string; error?: string }>;
      const code = ax.response?.data?.error;
      const msg = ax.response?.data?.message;
      if (code === "ai_disabled") {
        message.error(msg ?? "Aucun fournisseur d'IA configuré (Configuration › Intelligence artificielle).");
      } else {
        message.error(msg ?? "Échec de la génération IA.");
      }
    } finally {
      setLoading(false);
    }
  }, [ctx, form, htmlField, mode]);

  const apply = useCallback(() => {
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
    message.success("Variante appliquée — vérifiez le rendu dans l’éditeur et l’aperçu.");
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
              <span>Suggestions IA — variantes de ton</span>
            </Space>
          ),
          children: (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Alert
                type="info"
                showIcon
                message="Optionnel — fournisseur d'IA du CRM"
                description={
                  <Paragraph style={{ marginBottom: 0 }} type="secondary">
                    Utilise le fournisseur d&apos;IA choisi dans Configuration › Intelligence artificielle (Claude, OpenAI, DeepSeek…).
                    Sans fournisseur configuré, le bouton renvoie une erreur explicite. Les variables <Text code>{"{{prenom}}"}</Text> etc. doivent
                    rester présentes dans le texte généré ; relisez toujours avant envoi.
                  </Paragraph>
                }
              />
              <div>
                <Text type="secondary">Contexte lead (exemple, pour adapter le ton — facultatif)</Text>
                <div style={{ marginTop: 8 }}>
                  <Space wrap style={{ width: "100%" }}>
                    <Input
                      style={{ width: 140 }}
                      placeholder="Prénom"
                      value={ctx.prenom}
                      onChange={(e) => setCtx((c) => ({ ...c, prenom: e.target.value }))}
                    />
                    <Input
                      style={{ width: 200 }}
                      placeholder="Entreprise"
                      value={ctx.entreprise}
                      onChange={(e) => setCtx((c) => ({ ...c, entreprise: e.target.value }))}
                    />
                    <Input
                      style={{ width: 160 }}
                      placeholder="Secteur"
                      value={ctx.secteur}
                      onChange={(e) => setCtx((c) => ({ ...c, secteur: e.target.value }))}
                    />
                    <Input
                      style={{ width: 180 }}
                      placeholder="Titre / fonction"
                      value={ctx.titre}
                      onChange={(e) => setCtx((c) => ({ ...c, titre: e.target.value }))}
                    />
                  </Space>
                  <TextArea
                    style={{ marginTop: 8 }}
                    rows={2}
                    placeholder="Actualité ou contexte (ex. dernière levée de fonds, recrutement…)"
                    value={ctx.actu}
                    onChange={(e) => setCtx((c) => ({ ...c, actu: e.target.value }))}
                  />
                  <TextArea
                    style={{ marginTop: 8 }}
                    rows={2}
                    placeholder="Consigne rédactionnelle (ex. ton court, une question en fin de mail…)"
                    value={ctx.consigne}
                    onChange={(e) => setCtx((c) => ({ ...c, consigne: e.target.value }))}
                  />
                </div>
              </div>
              <Button type="default" icon={<ThunderboltOutlined />} loading={loading} onClick={() => void generate()}>
                Générer 2–3 variantes
              </Button>
              {variants.length > 0 && (
                <div>
                  <Text strong>Choisir une variante</Text>
                  <Radio.Group
                    style={{ display: "block", marginTop: 8 }}
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
                  <Button type="primary" style={{ marginTop: 12 }} onClick={apply}>
                    Appliquer au formulaire
                  </Button>
                </div>
              )}
            </Space>
          ),
        },
      ]}
    />
  );
}
