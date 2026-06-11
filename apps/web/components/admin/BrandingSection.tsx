"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form, Image, Input, Space, Spin, Typography, Upload, message } from "antd";
import { BgColorsOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { extractApiError, showErrorPopup, showSuccessPopup } from "@/lib/feedback";

const { Title, Paragraph, Text } = Typography;

type Branding = { siteName?: string; siteIconUrl?: string | null };

async function imageFileToDataUrl(file: File, maxPx = 128): Promise<string> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image illisible"));
      el.src = blobUrl;
    });
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function BrandingSection() {
  const [form] = Form.useForm<{ siteName?: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUrlInput, setIconUrlInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Branding }>("/organization/branding");
      form.setFieldsValue({ siteName: data.data.siteName });
      const icon = data.data.siteIconUrl ?? null;
      if (icon?.startsWith("data:")) {
        setIconPreview(icon);
        setIconUrlInput("");
      } else {
        setIconPreview(icon);
        setIconUrlInput(icon ?? "");
      }
    } catch {
      message.error("Impossible de charger l'identité visuelle.");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const siteName = form.getFieldValue("siteName") as string | undefined;
    const siteIconUrl = iconPreview ?? (iconUrlInput.trim() || null);
    setSaving(true);
    try {
      await api.put("/organization/branding", {
        siteName: siteName?.trim() || undefined,
        siteIconUrl,
      });
      showSuccessPopup(
        "Identité enregistrée",
        "Le nom et l'icône du site ont été mis à jour. Rechargez la page si le menu latéral n'a pas changé.",
      );
    } catch (e) {
      showErrorPopup("Enregistrement impossible", extractApiError(e, "Erreur inconnue"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Spin spinning={loading}>
        <Space align="start" style={{ marginBottom: 16 }}>
          <BgColorsOutlined style={{ fontSize: 28, color: "#1677ff" }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>Identité du site</Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Personnalisez le nom et l&apos;icône affichés en haut à gauche du tableau de bord.
            </Paragraph>
          </div>
        </Space>
        <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item name="siteName" label="Nom du site">
            <Input placeholder="CRM Lead Dashboard" maxLength={80} />
          </Form.Item>
          <Form.Item
            label="URL de l'icône (optionnel)"
            extra="URL publique https://… ou uploadez une image ci-dessous."
          >
            <Input
              placeholder="https://example.com/logo.png"
              value={iconUrlInput}
              onChange={(e) => {
                const v = e.target.value;
                setIconUrlInput(v);
                if (v.trim() && !v.trim().startsWith("data:")) {
                  setIconPreview(v.trim());
                }
              }}
            />
          </Form.Item>
          {iconPreview ? (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
                Aperçu — cliquez pour agrandir
              </Text>
              <Image
                src={iconPreview}
                alt="Aperçu icône"
                width={64}
                height={64}
                style={{ borderRadius: 12, objectFit: "cover", border: "1px solid #f0f0f0" }}
                preview={{ mask: "Agrandir" }}
              />
            </div>
          ) : null}
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              void (async () => {
                try {
                  const dataUrl = await imageFileToDataUrl(file);
                  setIconPreview(dataUrl);
                  setIconUrlInput("");
                  message.success("Image chargée — cliquez sur Enregistrer pour appliquer.");
                } catch {
                  showErrorPopup("Upload impossible", "Le fichier sélectionné n'est pas une image valide.");
                }
              })();
              return false;
            }}
          >
            <Button type="default" icon={<UploadOutlined />}>Uploader une icône</Button>
          </Upload>
          <div style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="button" onClick={() => void save()} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </Form>
      </Spin>
    </Card>
  );
}
