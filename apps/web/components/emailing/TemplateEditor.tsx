"use client";

/**
 * Édition d'un template email en pleine page : contenu à gauche (éditeur visuel / HTML),
 * aperçu fidèle à droite avec un vrai lead (variables remplacées), variantes de ton par Claude.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/hooks/useMounted";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Col, Form, Input, Row, Skeleton, message } from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { Panel } from "@/components/ui/Kit";
import { EmailPreview } from "@/components/campaigns/EmailPreview";
import type { PreviewLead, SegmentPreview } from "@/components/campaigns/types";
import { EmailHtmlDualEditor } from "./EmailHtmlDualEditor";
import { EmailTemplateAiVariants } from "./EmailTemplateAiVariants";

type TemplateRow = { id: string; name: string; category: string | null; subject: string; bodyHtml: string; variables: string[]; isPublic?: boolean };
type FormValues = { name: string; category?: string; subject: string; bodyHtml: string; variables?: string; isPublic: boolean };

export function TemplateEditor({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const mounted = useMounted();
  const [form] = Form.useForm<FormValues>();
  const [ready, setReady] = useState(!templateId);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState<PreviewLead[]>([]);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const [smtp, setSmtp] = useState<{ label: string; fromName?: string | null; fromEmail?: string | null } | null>(null);
  const subject = Form.useWatch("subject", form) ?? "";
  const bodyHtml = Form.useWatch("bodyHtml", form) ?? "";
  const name = Form.useWatch("name", form) ?? "";

  useEffect(() => {
    api.post<{ data: SegmentPreview }>("/segments/preview", { filters: {} }).then((r) => setSample(r.data.data.sample)).catch(() => {});
    api.get<{ data: { label: string; fromName?: string | null; fromEmail?: string | null; isActive?: boolean }[] }>("/smtp-configs")
      .then((r) => setSmtp(r.data.data.find((s) => s.isActive !== false) ?? null))
      .catch(() => {});
    if (!templateId) {
      form.setFieldsValue({ isPublic: true, variables: "prenom, entreprise", bodyHtml: "<p>Bonjour {{prenom}},</p><p></p>" });
      return;
    }
    api
      .get<{ data: TemplateRow }>(`/templates/${templateId}`)
      .then((r) => {
        const t = r.data.data;
        form.setFieldsValue({
          name: t.name, category: t.category ?? undefined, subject: t.subject, bodyHtml: t.bodyHtml,
          variables: (t.variables ?? []).join(", "), isPublic: t.isPublic ?? true,
        });
        setReady(true);
      })
      .catch(() => message.error("Template introuvable"));
  }, [templateId, form]);

  const save = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    const payload = {
      name: values.name,
      category: values.category?.trim() || undefined,
      subject: values.subject,
      bodyHtml: values.bodyHtml,
      isPublic: values.isPublic,
      variables: (values.variables ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    };
    try {
      if (templateId) await api.put(`/templates/${templateId}`, payload);
      else await api.post("/templates", payload);
      message.success(templateId ? "Template enregistré" : "Template créé");
      router.push("/settings#emailing");
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Enregistrement impossible");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 90, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="nb-fade-up" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link href="/settings#emailing"><Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nb-eyebrow">Configuration · Emailing · {templateId ? "modifier le template" : "nouveau template"}</div>
          <div className="nb-display" style={{ fontSize: 26, fontWeight: 700, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name || "Template sans nom"}
          </div>
        </div>
      </div>

      {!ready ? (
        <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>
      ) : (
        <Form form={form} layout="vertical" requiredMark={false}>
          <Row gutter={[20, 20]} align="top">
            <Col xs={24} xl={14}>
              <div style={{ display: "grid", gap: 20 }}>
                <Panel title="Identité du template" subtitle="Comment il apparaît dans les campagnes et les relances">
                  <Row gutter={16}>
                    <Col xs={24} md={14}>
                      <Form.Item name="name" label="Nom" rules={[{ required: true, message: "Nom requis" }]}>
                        <Input placeholder="Ex. Relance 1 — prospects froids" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={10}>
                      <Form.Item name="category" label="Catégorie" rules={[{ max: 100 }]}>
                        <Input placeholder="Ex. Prospection" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="subject" label="Objet" rules={[{ required: true, message: "Objet requis" }]} style={{ marginBottom: 8 }}>
                    <Input size="large" placeholder="Ex. {{prenom}}, une idée pour {{entreprise}}" />
                  </Form.Item>
                  <Form.Item name="isPublic" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox>Visible par toute l&apos;équipe (bibliothèque partagée)</Checkbox>
                  </Form.Item>
                </Panel>

                <Panel title="Message" subtitle="Éditeur visuel ou HTML — le contenu est synchronisé" accent={palette.pink}>
                  <Form.Item
                    name="bodyHtml"
                    style={{ marginBottom: 12 }}
                    rules={[{ validator: async (_, v) => { if (typeof v !== "string" || !v.replace(/<[^>]*>/g, "").trim()) throw new Error("Corps du message requis"); } }]}
                  >
                    <EmailHtmlDualEditor monacoHeight="420px" quillHeight={360} />
                  </Form.Item>
                  <Form.Item name="variables" label="Variables déclarées" help="Liste séparée par des virgules, utilisée pour documenter le template." style={{ marginBottom: 0 }}>
                    <Input placeholder="prenom, entreprise" />
                  </Form.Item>
                </Panel>

                <Panel title="Variantes de ton par l'IA" subtitle="Direct, relationnel ou formel — à appliquer en un clic" accent={palette.violet}>
                  <EmailTemplateAiVariants form={form} mode="template" />
                </Panel>
              </div>
            </Col>
            <Col xs={24} xl={10}>
              <div style={{ position: "sticky", top: 96 }}>
                <Panel title="Aperçu" subtitle="Tel que le prospect le recevra" accent={palette.cyan}>
                  <EmailPreview
                    fromName={smtp?.fromName ?? smtp?.label ?? ""}
                    fromEmail={smtp?.fromEmail ?? ""}
                    subject={subject}
                    html={bodyHtml}
                    leads={sample}
                    leadId={previewLead}
                    onLead={setPreviewLead}
                    ai={false}
                  />
                </Panel>
              </div>
            </Col>
          </Row>
        </Form>
      )}

      {mounted && createPortal(
        <div
          className="nb-glass"
          style={{
            position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, borderRadius: 18, padding: "10px 12px",
            display: "flex", alignItems: "center", gap: 10, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.55)", width: "min(560px, calc(100vw - 32px))",
          }}
        >
          <span style={{ flex: 1, fontSize: 13, color: "var(--nb-text-2)" }}>Les campagnes déjà envoyées ne sont pas modifiées.</span>
          <Link href="/settings#emailing"><Button>Annuler</Button></Link>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!ready} onClick={() => void save()}>
            {templateId ? "Enregistrer" : "Créer le template"}
          </Button>
        </div>,
        document.body,
      )}
    </div>
  );
}
