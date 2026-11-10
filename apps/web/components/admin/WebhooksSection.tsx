"use client";

/**
 * Section Intégrations / Webhooks (INT-01).
 *
 * Liste les webhooks sortants enregistrés, permet d'en créer/éditer/supprimer
 * et de tester l'envoi vers un endpoint distant. Chaque webhook reçoit un
 * secret HMAC-SHA256 généré automatiquement.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Space, Table,
  Tag, Tooltip, Typography, message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ApiOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, ReloadOutlined, SendOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Text, Paragraph } = Typography;

type Webhook = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  newLead: "Nouveau lead créé",
  leadReplied: "Réponse reçue",
  leadStatusChanged: "Changement de statut",
  campaignDone: "Campagne terminée",
  unsubscribe: "Désinscription",
};

const ALL_EVENTS = Object.keys(EVENT_LABELS);

export function WebhooksSection() {
  const [rows, setRows] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [form] = Form.useForm();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Webhook[] }>("/webhooks");
      setRows(data.data);
    } catch {
      message.error("Impossible de charger les webhooks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ events: ["newLead"], isActive: true });
    setCreateOpen(true);
  }
  function openEdit(w: Webhook) {
    setEditing(w);
    form.setFieldsValue({ url: w.url, events: w.events, isActive: w.isActive });
    setCreateOpen(true);
  }

  async function submit() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/webhooks/${editing.id}`, values);
        message.success("Webhook mis à jour");
      } else {
        await api.post("/webhooks", values);
        message.success("Webhook créé — un secret HMAC a été généré côté serveur");
      }
      setCreateOpen(false);
      form.resetFields();
      void fetchAll();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOne(id: string) {
    try {
      await api.delete(`/webhooks/${id}`);
      message.success("Webhook supprimé");
      void fetchAll();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  async function testOne(id: string) {
    try {
      const { data } = await api.post<{ data: { ok: boolean; status?: number; error?: string } }>(`/webhooks/${id}/test`);
      if (data.data.ok) {
        message.success(`Test OK (HTTP ${data.data.status ?? "200"})`);
      } else {
        message.error(`Test KO : ${data.data.error ?? `HTTP ${data.data.status ?? "?"}`}`);
      }
    } catch {
      message.error("Échec du test.");
    }
  }

  const columns: ColumnsType<Webhook> = [
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "Événements",
      dataIndex: "events",
      key: "events",
      width: 280,
      render: (events: string[]) => (
        <Space size={4} wrap>
          {events.map((e) => (
            <Tag key={e}>{EVENT_LABELS[e] ?? e}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Statut",
      dataIndex: "isActive",
      key: "isActive",
      width: 110,
      align: "center",
      render: (v: boolean) =>
        v
          ? <Tag color="green" icon={<CheckOutlined />}>Actif</Tag>
          : <Tag icon={<CloseOutlined />}>Inactif</Tag>,
    },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Tester l'envoi">
            <Button size="small" icon={<SendOutlined />} onClick={() => void testOne(r.id)} />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm
            title="Supprimer ce webhook ?"
            onConfirm={() => void deleteOne(r.id)}
            okText="Supprimer"
            okButtonProps={{ danger: true }}
            cancelText="Annuler"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space style={{ width: "100%" }}>
          <ApiOutlined style={{ fontSize: 20, color: "#8b5cf6" }} />
          <div style={{ flex: 1 }}>
            <Text strong>Webhooks sortants</Text>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
              Émettez vers Zapier, Make, n8n ou tout endpoint HTTP à chaque
              événement important (nouveau lead, réponse reçue, désinscription…).
            </Paragraph>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nouveau webhook
          </Button>
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        icon={<ThunderboltOutlined />}
        message="Comment vérifier la signature côté Zapier/Make ?"
        description={
          <span style={{ fontSize: 12 }}>
            Chaque requête contient un header <Text code>X-Webhook-Signature: sha256=&lt;hex&gt;</Text>.
            Calculez côté tiers <Text code>HMAC-SHA256(secret, body)</Text> et comparez. L'événement
            est dans le header <Text code>X-Webhook-Event</Text>. Timeout 10s par destination, 1 essai.
          </span>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="middle"
        scroll={{ x: 800 }}
        pagination={false}
      />

      <Modal
        title={editing ? "Modifier le webhook" : "Nouveau webhook"}
        open={createOpen}
        onOk={() => void submit()}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={saving}
        okText={editing ? "Enregistrer" : "Créer"}
        cancelText="Annuler"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="url"
            label="URL de destination"
            rules={[{ required: true, type: "url", message: "URL HTTPS recommandée" }]}
          >
            <Input placeholder="https://hooks.zapier.com/hooks/catch/…" />
          </Form.Item>
          <Form.Item
            name="events"
            label="Événements abonnés"
            rules={[{ required: true, message: "Au moins un événement" }]}
          >
            <Checkbox.Group
              options={ALL_EVENTS.map((e) => ({ value: e, label: EVENT_LABELS[e] }))}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            />
          </Form.Item>
          <Form.Item name="isActive" valuePropName="checked" label="Statut">
            <Checkbox>Webhook actif (recevra les événements)</Checkbox>
          </Form.Item>
          {!editing && (
            <Alert
              type="info"
              showIcon
              message="Un secret HMAC sera généré automatiquement"
              description="Le secret sert à signer les payloads. Il restera stocké côté serveur et ne sera plus affiché ensuite."
              style={{ marginTop: 8 }}
            />
          )}
        </Form>
      </Modal>
    </Space>
  );
}
