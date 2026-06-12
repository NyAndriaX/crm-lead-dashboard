"use client";

/**
 * Galerie de modèles d'import (extension de I-02).
 *
 * Affiche les 5 modèles disponibles sous forme de cards. Chaque card propose
 * 2 actions : télécharger en XLSX ou CSV. Une icône permet d'afficher un
 * aperçu (drawer) avec les colonnes incluses et les lignes d'exemple.
 */
import { useEffect, useState } from "react";
import { Card, Col, Row, Space, Tag, Button, Drawer, Typography, Table, Tooltip, Skeleton } from "antd";
import {
  DownloadOutlined, EyeOutlined, FileExcelOutlined, FileTextOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { api, apiFetch } from "@/lib/client";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Title, Text, Paragraph } = Typography;

type TemplateMeta = {
  id: string;
  name: string;
  description: string;
  useCase: string;
  color: string;
  columnCount: number;
  exampleRowCount: number;
};

type TemplatePreview = TemplateMeta & {
  columns: string[];
  examples: Record<string, string>[];
};

export function ImportTemplateGallery() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState<TemplatePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ data: TemplateMeta[] }>("/import/templates");
        setTemplates(data.data);
      } catch (e) { notifyApiError(e, "Impossible de charger les modèles."); } finally {
        setLoading(false);
      }
    })();
  }, []);

  function downloadUrl(id: string, format: "xlsx" | "csv"): string {
    return `/api/import/template?id=${id}&format=${format}`;
  }

  async function openPreview(meta: TemplateMeta) {
    setLoadingPreview(true);
    try {
      // On télécharge le CSV pour parser un aperçu rapide
      const r = await apiFetch(downloadUrl(meta.id, "csv"));
      const text = await r.text();
      const lines = text.replace(/^﻿/, "").split("\n").filter(Boolean);
      const headers = (lines[0] ?? "").split(";");
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(";");
        const o: Record<string, string> = {};
        headers.forEach((h, i) => { o[h] = (cells[i] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"'); });
        return o;
      });
      setPreviewOpen({ ...meta, columns: headers, examples: rows });
    } catch (e) { notifyApiError(e, "Aperçu indisponible."); } finally {
      setLoadingPreview(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <Skeleton active />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <AppstoreOutlined />
          <span>Galerie de modèles d'import</span>
        </Space>
      }
      extra={<Text type="secondary" style={{ fontSize: 12 }}>5 modèles disponibles</Text>}
      size="small"
    >
      <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        Choisissez un modèle adapté à votre cas d'usage. Chaque XLSX contient
        une feuille <em>Leads</em> avec exemples et une feuille <em>Guide</em>
        documentant chaque colonne.
      </Paragraph>
      <Row gutter={[12, 12]}>
        {templates.map((t) => (
          <Col key={t.id} xs={24} sm={12} lg={8}>
            <Card
              size="small"
              hoverable
              styles={{ body: { padding: 12 } }}
              style={{ height: "100%" }}
            >
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Tag color={t.color} style={{ margin: 0 }}>{t.useCase}</Tag>
                  <Tooltip title="Aperçu des colonnes et exemples">
                    <Button
                      type="text"
                      size="small"
                      icon={<EyeOutlined />}
                      loading={loadingPreview}
                      onClick={() => void openPreview(t)}
                    />
                  </Tooltip>
                </Space>
                <Title level={5} style={{ margin: 0 }}>{t.name}</Title>
                <Text type="secondary" style={{ fontSize: 12, minHeight: 32 }}>
                  {t.description}
                </Text>
                <Space size={6}>
                  <Tag style={{ margin: 0 }}>{t.columnCount} colonnes</Tag>
                  <Tag style={{ margin: 0 }}>{t.exampleRowCount} exemples</Tag>
                </Space>
                <Space size={6} style={{ marginTop: 4 }}>
                  <Button
                    icon={<FileExcelOutlined />}
                    size="small"
                    type="primary"
                    href={downloadUrl(t.id, "xlsx")}
                  >
                    Excel
                  </Button>
                  <Button
                    icon={<FileTextOutlined />}
                    size="small"
                    href={downloadUrl(t.id, "csv")}
                  >
                    CSV
                  </Button>
                </Space>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Drawer
        open={!!previewOpen}
        onClose={() => setPreviewOpen(null)}
        width={720}
        title={
          previewOpen && (
            <Space>
              <Tag color={previewOpen.color}>{previewOpen.useCase}</Tag>
              <span>{previewOpen.name}</span>
            </Space>
          )
        }
      >
        {previewOpen && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Paragraph type="secondary" style={{ margin: 0 }}>{previewOpen.description}</Paragraph>
            <div>
              <Text strong>Colonnes incluses :</Text>
              <div style={{ marginTop: 8 }}>
                {previewOpen.columns.map((c) => (
                  <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>
                ))}
              </div>
            </div>
            <div>
              <Text strong>Données d'exemple :</Text>
              <Table
                size="small"
                rowKey={(_, idx) => idx ?? ""}
                style={{ marginTop: 8 }}
                scroll={{ x: 800 }}
                pagination={false}
                columns={previewOpen.columns.map((c) => ({
                  title: c,
                  dataIndex: c,
                  key: c,
                  ellipsis: true,
                  render: (v: string | null) => v
                    ? <Text style={{ fontSize: 12 }}>{v}</Text>
                    : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
                }))}
                dataSource={previewOpen.examples}
              />
            </div>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                href={downloadUrl(previewOpen.id, "xlsx")}
              >
                Télécharger Excel
              </Button>
              <Button
                icon={<DownloadOutlined />}
                href={downloadUrl(previewOpen.id, "csv")}
              >
                Télécharger CSV
              </Button>
            </Space>
          </Space>
        )}
      </Drawer>
    </Card>
  );
}
