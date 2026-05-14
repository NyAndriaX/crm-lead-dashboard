"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card, Table, Button, Space, Typography, Tag, Switch, Modal, Form, Input, InputNumber, Select,
  Popconfirm, message, Empty, Divider, Drawer,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, RetweetOutlined, DeleteOutlined, PauseOutlined,
  PlayCircleOutlined, EditOutlined, TeamOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Title, Text } = Typography;

type Step = {
  delayDays: number;
  templateId?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  stopOnReply?: boolean;
};
type SequenceRow = {
  id: string;
  name: string;
  steps: Step[];
  maxSteps: number | null;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
  stats: Record<string, number>;
};
type SequenceLeadRow = {
  id: string;
  leadId: string;
  currentStep: number;
  nextSendAt: string | null;
  sentCount: number;
  status: string;
  stoppedReason: string | null;
  createdAt: string;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    status: string;
    emailStatus: string;
    lastReplyAt: string | null;
  };
};
type TemplateOption = { id: string; name: string; subject: string };
type LeadOption = { id: string; firstName: string | null; lastName: string | null; company: string | null };

export default function SequencesPage() {
  const [rows, setRows] = useState<SequenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SequenceRow | null>(null);
  const [form] = Form.useForm();
  const [leadsOpen, setLeadsOpen] = useState<SequenceRow | null>(null);
  const [leads, setLeads] = useState<SequenceLeadRow[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [allLeads, setAllLeads] = useState<LeadOption[]>([]);
  const [enrollIds, setEnrollIds] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: SequenceRow[] }>("/sequences");
      setRows(r.data.data);
    } catch {
      message.error("Impossible de charger les séquences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<{ data: TemplateOption[] }>("/templates").then((r) => setTemplates(r.data.data)).catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      maxSteps: null,
      steps: [{ delayDays: 0, templateId: null, stopOnReply: true }],
    });
    setEditorOpen(true);
  }
  function openEdit(seq: SequenceRow) {
    setEditing(seq);
    form.setFieldsValue({
      name: seq.name,
      maxSteps: seq.maxSteps,
      steps: seq.steps?.length ? seq.steps : [{ delayDays: 0, templateId: null, stopOnReply: true }],
    });
    setEditorOpen(true);
  }

  async function submit() {
    try {
      const values = await form.validateFields();
      const body = {
        name: values.name,
        maxSteps: values.maxSteps ?? null,
        steps: (values.steps as Step[]).map((s) => ({
          delayDays: Number(s.delayDays ?? 0),
          templateId: s.templateId || null,
          subject: s.subject || null,
          bodyHtml: s.bodyHtml || null,
          stopOnReply: s.stopOnReply !== false,
        })),
      };
      if (editing) {
        await api.put(`/sequences/${editing.id}`, body);
        message.success("Séquence mise à jour");
      } else {
        await api.post("/sequences", body);
        message.success("Séquence créée");
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    }
  }

  async function togglePause(seq: SequenceRow) {
    try {
      await api.patch(`/sequences/${seq.id}`, { isPaused: !seq.isPaused });
      await load();
    } catch {
      message.error("Échec de la mise à jour.");
    }
  }

  async function destroy(seq: SequenceRow) {
    try {
      await api.delete(`/sequences/${seq.id}`);
      message.success("Séquence supprimée");
      await load();
    } catch {
      message.error("Échec de la suppression.");
    }
  }

  async function openLeads(seq: SequenceRow) {
    setLeadsOpen(seq);
    try {
      const r = await api.get<{ data: SequenceLeadRow[] }>(`/sequences/${seq.id}/leads`);
      setLeads(r.data.data);
    } catch {
      message.error("Impossible de charger les leads de la séquence.");
    }
  }

  async function openEnroll() {
    if (!leadsOpen) return;
    setEnrollOpen(true);
    setEnrollIds([]);
    try {
      const r = await api.get<{ data: LeadOption[] }>("/leads?pageSize=500");
      setAllLeads(r.data.data);
    } catch {
      message.error("Impossible de charger les leads.");
    }
  }

  async function submitEnroll() {
    if (!leadsOpen) return;
    if (enrollIds.length === 0) {
      message.warning("Sélectionnez au moins un lead.");
      return;
    }
    setEnrolling(true);
    try {
      const r = await api.post<{ data: { enrolled: number; skipped: number } }>(
        `/sequences/${leadsOpen.id}/leads`,
        { leadIds: enrollIds },
      );
      message.success(`Inscrits : ${r.data.data.enrolled}, déjà présents : ${r.data.data.skipped}`);
      setEnrollOpen(false);
      const refreshed = await api.get<{ data: SequenceLeadRow[] }>(`/sequences/${leadsOpen.id}/leads`);
      setLeads(refreshed.data.data);
      await load();
    } catch {
      message.error("Échec de l'inscription.");
    } finally {
      setEnrolling(false);
    }
  }

  async function unenroll(leadId: string) {
    if (!leadsOpen) return;
    try {
      await api.delete(`/sequences/${leadsOpen.id}/leads`, { data: { leadId } });
      message.success("Lead retiré");
      const refreshed = await api.get<{ data: SequenceLeadRow[] }>(`/sequences/${leadsOpen.id}/leads`);
      setLeads(refreshed.data.data);
    } catch {
      message.error("Échec du retrait.");
    }
  }

  const columns = [
    {
      title: "Nom",
      dataIndex: "name",
      render: (v: string, r: SequenceRow) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.steps?.length ?? 0} step(s){r.maxSteps ? ` · max ${r.maxSteps}` : ""}
          </Text>
        </Space>
      ),
    },
    {
      title: "État",
      key: "state",
      width: 120,
      render: (_: unknown, r: SequenceRow) =>
        r.isPaused ? <Tag color="orange">en pause</Tag> : <Tag color="green">active</Tag>,
    },
    {
      title: "Leads inscrits",
      key: "stats",
      width: 280,
      render: (_: unknown, r: SequenceRow) => {
        const s = r.stats ?? {};
        return (
          <Space size={4} wrap>
            <Tag color="green">actifs : {s.active ?? 0}</Tag>
            <Tag color="blue">terminés : {s.completed ?? 0}</Tag>
            <Tag color="red">stoppés : {s.stopped ?? 0}</Tag>
          </Space>
        );
      },
    },
    {
      title: "Créée",
      dataIndex: "createdAt",
      width: 150,
      render: (v: string) => <Text type="secondary">{new Date(v).toLocaleDateString("fr-FR")}</Text>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 260,
      render: (_: unknown, r: SequenceRow) => (
        <Space size={4} wrap>
          <Button size="small" icon={<TeamOutlined />} onClick={() => void openLeads(r)}>Leads</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Éditer</Button>
          <Button
            size="small"
            icon={r.isPaused ? <PlayCircleOutlined /> : <PauseOutlined />}
            onClick={() => void togglePause(r)}
          >
            {r.isPaused ? "Reprendre" : "Pause"}
          </Button>
          <Popconfirm title="Supprimer cette séquence ?" onConfirm={() => void destroy(r)} okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div className="page-stack page-stack-between">
        <Title level={3} style={{ margin: 0 }}><RetweetOutlined /> Séquences de relance</Title>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>Rafraîchir</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nouvelle séquence</Button>
        </Space>
      </div>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          loading={loading}
          size="small"
          locale={{ emptyText: <Empty description="Aucune séquence. Créez-en une pour planifier vos relances." /> }}
          pagination={false}
        />
      </Card>

      <Modal
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={() => void submit()}
        okText={editing ? "Enregistrer" : "Créer"}
        title={editing ? "Modifier la séquence" : "Nouvelle séquence"}
        width={720}
        destroyOnHidden
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Nom" name="name" rules={[{ required: true, message: "Nom requis" }]}>
            <Input placeholder="Ex : Relance 3 étapes — prospects froids" />
          </Form.Item>
          <Form.Item label="Limite globale (max steps, optionnel)" name="maxSteps">
            <InputNumber min={1} max={20} placeholder="Ex : 3" style={{ width: "100%" }} />
          </Form.Item>

          <Divider orientation="left" plain>Étapes</Divider>
          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, idx) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 12 }} title={`Étape ${idx + 1}`}
                    extra={fields.length > 1 ? (
                      <Button danger size="small" onClick={() => remove(field.name)}>Retirer</Button>
                    ) : null}
                  >
                    <Space size={12} style={{ width: "100%" }} direction="vertical">
                      <Space size={12} wrap>
                        <Form.Item
                          name={[field.name, "delayDays"]}
                          label="Délai (jours après étape précédente)"
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={0} max={365} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "stopOnReply"]}
                          label="Arrêt si réponse"
                          valuePropName="checked"
                          style={{ marginBottom: 0 }}
                        >
                          <Switch defaultChecked />
                        </Form.Item>
                      </Space>
                      <Form.Item
                        name={[field.name, "templateId"]}
                        label="Template (ou laisser vide pour sujet/corps personnalisé)"
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          allowClear
                          placeholder="Choisir un template"
                          options={templates.map((t) => ({ value: t.id, label: `${t.name} — ${t.subject}` }))}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, "subject"]} label="Sujet (optionnel — override template)" style={{ marginBottom: 0 }}>
                        <Input placeholder="Sujet personnalisé" />
                      </Form.Item>
                      <Form.Item name={[field.name, "bodyHtml"]} label="Corps HTML (optionnel — override template)" style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={4} placeholder="<p>Bonjour {{prenom}}...</p>" />
                      </Form.Item>
                    </Space>
                  </Card>
                ))}
                <Button block onClick={() => add({ delayDays: 3, templateId: null, stopOnReply: true })} icon={<PlusOutlined />}>
                  Ajouter une étape
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Drawer
        open={!!leadsOpen}
        onClose={() => setLeadsOpen(null)}
        width={720}
        title={leadsOpen ? `Leads dans « ${leadsOpen.name} »` : ""}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => void openEnroll()}>Inscrire des leads</Button>}
        destroyOnHidden
      >
        <Table<SequenceLeadRow>
          rowKey="id"
          dataSource={leads}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{ emptyText: <Empty description="Aucun lead inscrit" /> }}
          columns={[
            {
              title: "Lead",
              key: "lead",
              render: (_: unknown, r) => (
                <Space direction="vertical" size={0}>
                  <Text strong>
                    {[r.lead.firstName, r.lead.lastName].filter(Boolean).join(" ") || r.lead.company || "(sans nom)"}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{r.lead.company ?? ""}</Text>
                </Space>
              ),
            },
            {
              title: "Étape",
              key: "step",
              width: 90,
              render: (_: unknown, r) => `${r.currentStep + 1}`,
            },
            {
              title: "Statut",
              dataIndex: "status",
              width: 110,
              render: (v: string, r) => (
                <Tag color={v === "active" ? "green" : v === "completed" ? "blue" : "red"}>
                  {v}{r.stoppedReason ? ` (${r.stoppedReason})` : ""}
                </Tag>
              ),
            },
            {
              title: "Prochain envoi",
              dataIndex: "nextSendAt",
              width: 160,
              render: (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—"),
            },
            {
              title: "",
              key: "actions",
              width: 80,
              render: (_: unknown, r) =>
                r.status === "active" || r.status === "paused" ? (
                  <Popconfirm title="Retirer ce lead ?" onConfirm={() => void unenroll(r.leadId)}>
                    <Button size="small" danger>Retirer</Button>
                  </Popconfirm>
                ) : null,
            },
          ]}
        />
      </Drawer>

      <Modal
        open={enrollOpen}
        onCancel={() => setEnrollOpen(false)}
        onOk={() => void submitEnroll()}
        confirmLoading={enrolling}
        title="Inscrire des leads"
        width={600}
        destroyOnHidden
        okText="Inscrire"
      >
        <Text type="secondary">
          Sélectionnez les leads à inscrire. La 1ʳᵉ étape sera planifiée selon le délai de l&apos;étape 1 (0 = immédiat).
        </Text>
        <Select
          mode="multiple"
          showSearch
          placeholder="Rechercher un lead…"
          style={{ width: "100%", marginTop: 12 }}
          value={enrollIds}
          onChange={setEnrollIds}
          options={allLeads.map((l) => ({
            value: l.id,
            label: `${[l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "(sans nom)"}${l.company ? ` — ${l.company}` : ""}`,
          }))}
          filterOption={(input, option) => String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          maxTagCount="responsive"
        />
      </Modal>
    </Space>
  );
}
