"use client";

import { useCallback, useId, useState, type CSSProperties } from "react";
import {
  Alert,
  Button,
  Collapse,
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
  const [notice, setNotice] = useState<Notice | null>(null);
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

  const generate = useCallback(async () => {
    const bodyHtml = form.getFieldValue(htmlField);
    if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
      show(
        "warning",
        mode === "template"
          ? "Ajoutez d’abord un corps de message (brouillon suffit)."
          : "Ajoutez d’abord du contenu HTML au bloc.",
      );
      return;
    }
    const variables = parseVariables(form.getFieldValue("variables"));
    const subject = mode === "template" ? String(form.getFieldValue("subject") ?? "").trim() : undefined;
    if (mode === "template" && !subject) {
      show("warning", "Renseignez un sujet (même provisoire) avant de lancer l’IA.");
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
      const code = ax.response?.data?.error;
      const msg = ax.response?.data?.message;
      if (code === "ai_disabled") {
        show("error", msg ?? "Configurez votre clé OpenAI dans Mon compte → Intégration IA.");
      } else {
        show("error", msg ?? "Échec de la génération IA.");
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
    show("success", "Variante appliquée — vérifiez le rendu dans l’éditeur et l’aperçu.");
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
              {notice ? (
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
              ) : null}
              <Alert
                type="info"
                showIcon
                message="Optionnel — votre clé OpenAI"
                description={
                  <Paragraph style={{ marginBottom: 0 }} type="secondary">
                    Configurez votre clé dans <a href="/account">Mon compte → Intégration IA</a>. Sans clé active, le
                    bouton renvoie une erreur explicite. Les variables <Text code>{"{{prenom}}"}</Text> etc. doivent
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
