"use client";

/**
 * Configuration des comptes IMAP utilisés pour la collecte des réponses (R-01).
 *
 * - CRUD chiffré (loginEnc/passwordEnc côté serveur).
 * - Test de connexion via /api/imap-configs/test.
 * - Affichage de la date du dernier sync (mise à jour par le job worker imap-sync).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Card, Table, Button, Space, Tag, Typography, Form, Input, InputNumber, Switch,
  Modal, message, Popconfirm, Empty, Tooltip,
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, ApiOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";

const { Title, Text, Paragraph } = Typography;

type ImapConfigRow = {
  id: string;
  label: string;
  host: string;
  port: number;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
};

type FormValues = {
  label: string;
  host: string;
  port: number;
  login: string;
  password: string;
  isActive: boolean;
};

export function ImapSection() {
  const [rows, setRows] = useState<ImapConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ImapConfigRow | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: ImapConfigRow[] }>("/imap-configs");
      setRows(r.data.data);
    } catch {
      message.error("Impossible de charger les comptes IMAP.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ port: 993, isActive: true });
    setEditorOpen(true);
  }
  function openEdit(row: ImapConfigRow) {
    setEditing(row);
    form.setFieldsValue({
      label: row.label,
      host: row.host,
      port: row.port,
      isActive: row.isActive,
      login: "",
      password: "",
    });
    setEditorOpen(true);
  }

  async function save() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        const patch: Partial<FormValues> = {
          label: values.label,
          host: values.host,
          port: values.port,
          isActive: values.isActive,
        };
        if (values.login) patch.login = values.login;
        if (values.password) patch.password = values.password;
        await api.put(`/imap-configs/${editing.id}`, patch);
        message.success("Compte IMAP mis à jour");
      } else {
        await api.post("/imap-configs", values);
        message.success("Compte IMAP créé");
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    try {
      const v = await form.validateFields(["host", "port", "login", "password"]);
      setTesting(true);
      await api.post("/imap-configs/test", v);
      message.success("Connexion IMAP réussie");
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function destroy(row: ImapConfigRow) {
    try {
      await api.delete(`/imap-configs/${row.id}`);
      message.success("Compte IMAP supprimé");
      await load();
    } catch {
      message.error("Échec de la suppression.");
    }
  }

  async function toggleActive(row: ImapConfigRow) {
    try {
      await api.put(`/imap-configs/${row.id}`, { isActive: !row.isActive });
      await load();
    } catch {
      message.error("Échec de la mise à jour.");
    }
  }

  const columns: ColumnsType<ImapConfigRow> = [
    {
      title: "Compte",
      key: "label",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.label}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.host}:{r.port}</Text>
        </Space>
      ),
    },
    {
      title: "Actif",
      key: "isActive",
      width: 90,
      render: (_, r) => (
        <Switch size="small" checked={r.isActive} onChange={() => void toggleActive(r)} />
      ),
    },
    {
      title: "Dernier sync",
      dataIndex: "lastSyncAt",
      width: 200,
      render: (v: string | null) => (
        v ? <Text type="secondary">{new Date(v).toLocaleString("fr-FR")}</Text>
          : <Tag color="default">jamais</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Modifier">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="Supprimer ce compte ?" onConfirm={() => void destroy(r)} okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<Space><InboxOutlined /> <Title level={5} style={{ margin: 0 }}>Comptes IMAP</Title></Space>}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>Rafraîchir</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Ajouter un compte</Button>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Les comptes IMAP listés ici sont relevés automatiquement toutes les 5 minutes par le worker.
        Les réponses sont rattachées aux leads par fil de discussion (Message-ID / In-Reply-To) ou par adresse expéditeur.
        Les identifiants sont chiffrés (AES-256-GCM) et ne sont jamais ré-affichés en clair.
      </Paragraph>

      <Table<ImapConfigRow>
        rowKey="id"
        dataSource={rows}
        loading={loading}
        columns={columns}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="Aucun compte IMAP. Ajoutez-en un pour activer la collecte des réponses." /> }}
      />

      <Modal
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText={editing ? "Enregistrer" : "Créer"}
        title={editing ? "Modifier le compte IMAP" : "Nouveau compte IMAP"}
        destroyOnHidden
        width={560}
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Libellé" name="label" rules={[{ required: true, message: "Libellé requis" }]}>
            <Input placeholder="Ex : Support inbox prospection" />
          </Form.Item>
          <Form.Item label="Hôte IMAP" name="host" rules={[{ required: true, message: "Hôte requis" }]}>
            <Input placeholder="imap.example.com" />
          </Form.Item>
          <Form.Item label="Port" name="port" rules={[{ required: true, message: "Port requis" }]}>
            <InputNumber min={1} max={65535} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="Identifiant"
            name="login"
            rules={editing ? [] : [{ required: true, message: "Identifiant requis" }]}
            extra={editing ? "Laisser vide pour conserver l'identifiant existant." : undefined}
          >
            <Input placeholder="utilisateur@example.com" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Mot de passe"
            name="password"
            rules={editing ? [] : [{ required: true, message: "Mot de passe requis" }]}
            extra={editing ? "Laisser vide pour conserver le mot de passe existant." : undefined}
          >
            <Input.Password placeholder="••••••••" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="Compte actif" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button icon={<ApiOutlined />} onClick={() => void test()} loading={testing}>
            Tester la connexion
          </Button>
        </Form>
      </Modal>
    </Card>
  );
}
