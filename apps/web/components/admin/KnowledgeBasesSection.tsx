"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Typography, Upload } from "antd";
import { BookOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  contentMd: string;
  updatedAt: string;
};

export function KnowledgeBasesSection() {
  const [rows, setRows] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: KnowledgeBase[] }>("/knowledge-bases");
      setRows(data.data);
    } catch (e) { notifyApiError(e, "Impossible de charger les bases de connaissances."); } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  }

  function openEdit(row: KnowledgeBase) {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  }

  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/knowledge-bases/${editing.id}`, values);
        notifySuccess("Base mise à jour");
      } else {
        await api.post("/knowledge-bases", values);
        notifySuccess("Base créée");
      }
      setOpen(false);
      void load();
    } catch (e) { notifyApiError(e, "Enregistrement impossible"); } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/knowledge-bases/${id}`);
      notifySuccess("Base supprimée");
      void load();
    } catch (e) { notifyApiError(e, "Suppression impossible"); }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space align="start">
          <BookOutlined style={{ fontSize: 28, color: "#1677ff" }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>Bases de connaissances</Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              Documents Markdown réutilisables dans les campagnes emailing, les relances et les réponses automatiques.
            </Paragraph>
          </div>
        </Space>
      </Card>

      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nouvelle base
          </Button>
        }
      >
        <Table<KnowledgeBase>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: "Nom", dataIndex: "name" },
            {
              title: "Description",
              dataIndex: "description",
              ellipsis: true,
              render: (v: string | null) => v ?? "—",
            },
            {
              title: "Modifié",
              dataIndex: "updatedAt",
              width: 160,
              render: (v: string) => new Date(v).toLocaleString("fr-FR"),
            },
            {
              title: "Actions",
              key: "actions",
              width: 140,
              render: (_, row) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                  <Popconfirm title="Supprimer cette base ?" onConfirm={() => void remove(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editing ? "Modifier la base" : "Nouvelle base de connaissances"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        width={720}
        okText="Enregistrer"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true }]}>
            <Input placeholder="Ex : Offre commerciale 2026" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Résumé court" />
          </Form.Item>
          <Form.Item name="contentMd" label="Contenu Markdown" rules={[{ required: true }]}>
            <TextArea rows={12} placeholder="# Titre&#10;&#10;Votre contenu…" />
          </Form.Item>
          <Upload
            accept=".md,.txt,.markdown"
            showUploadList={false}
            beforeUpload={(file) => {
              const reader = new FileReader();
              reader.onload = () => {
                form.setFieldsValue({ contentMd: String(reader.result ?? "") });
                if (!form.getFieldValue("name")) form.setFieldValue("name", file.name.replace(/\.[^.]+$/, ""));
              };
              reader.readAsText(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />}>Importer un fichier .md</Button>
          </Upload>
          <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
            Ce contenu sera injecté dans les prompts IA lorsqu'une base est sélectionnée.
          </Text>
        </Form>
      </Modal>
    </Space>
  );
}
