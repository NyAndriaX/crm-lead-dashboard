"use client";

/**
 * Section Pipeline / Étapes (PL-02) — configuration des étapes commerciales.
 *
 * - Liste des étapes avec leur ordre, couleur, et compteur de leads.
 * - Drag-drop pour réordonner (PUT /api/pipeline-stages/reorder).
 * - Modale création / renommage avec sélecteur de couleur.
 * - Suppression sécurisée : si l'étape contient des leads, demande où les réassigner.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Button, Card, ColorPicker, Form, Input, Modal, Popconfirm, Select, Space, Table,
  Tag, Typography, message, Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DragOutlined, EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined,
  ProjectOutlined,
} from "@ant-design/icons";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { api } from "@/lib/client";

const { Text, Paragraph } = Typography;

type StageRow = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  leadCount: number;
  createdAt: string;
};

const DEFAULT_COLORS = ["#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2", "#eb2f96", "#f5222d", "#595959"];

export function PipelineStagesSection() {
  const [stages, setStages] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StageRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StageRow | null>(null);
  const [reassignTo, setReassignTo] = useState<string | undefined>();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const fetchStages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: StageRow[] }>("/pipeline-stages");
      setStages(data.data);
    } catch {
      message.error("Impossible de charger les étapes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStages(); }, [fetchStages]);

  async function createStage() {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await api.post("/pipeline-stages", {
        name: values.name,
        color: typeof values.color === "object" && values.color?.toHexString ? values.color.toHexString() : values.color ?? null,
      });
      message.success("Étape créée");
      createForm.resetFields();
      setCreateOpen(false);
      void fetchStages();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await api.put(`/pipeline-stages/${editTarget.id}`, {
        name: values.name,
        color: typeof values.color === "object" && values.color?.toHexString ? values.color.toHexString() : values.color ?? null,
      });
      message.success("Étape mise à jour");
      setEditTarget(null);
      void fetchStages();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
      await api.delete(`/pipeline-stages/${deleteTarget.id}${qs}`);
      message.success(`Étape « ${deleteTarget.name} » supprimée`);
      setDeleteTarget(null);
      setReassignTo(undefined);
      void fetchStages();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    const next = Array.from(stages);
    const [moved] = next.splice(result.source.index, 1);
    if (!moved) return;
    next.splice(result.destination.index, 0, moved);
    // Optimistic update
    setStages(next.map((s, idx) => ({ ...s, order: idx })));
    try {
      await api.put("/pipeline-stages/reorder", { orderedIds: next.map((s) => s.id) });
    } catch {
      message.error("Impossible de réordonner — rechargement.");
      void fetchStages();
    }
  }

  const columns: ColumnsType<StageRow> = [
    {
      title: "",
      key: "drag",
      width: 32,
      render: () => <DragOutlined style={{ color: "#bfbfbf", cursor: "grab" }} />,
    },
    {
      title: "Étape",
      key: "name",
      render: (_, r) => (
        <Space>
          <div
            style={{
              width: 14, height: 14, borderRadius: 4,
              background: r.color ?? "#d9d9d9", border: "1px solid #e8e8e8",
            }}
          />
          <Text strong>{r.name}</Text>
        </Space>
      ),
    },
    {
      title: "Ordre",
      dataIndex: "order",
      key: "order",
      width: 80,
      render: (v) => <Tag>{v + 1}</Tag>,
    },
    {
      title: "Leads",
      dataIndex: "leadCount",
      key: "leadCount",
      width: 100,
      render: (v: number) => (
        <Tag color={v > 0 ? "blue" : "default"}>{v} lead{v > 1 ? "s" : ""}</Tag>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditTarget(r);
              editForm.setFieldsValue({ name: r.name, color: r.color ?? DEFAULT_COLORS[0] });
            }}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setDeleteTarget(r)}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space style={{ width: "100%" }}>
          <ProjectOutlined style={{ fontSize: 20, color: "#1677ff" }} />
          <div style={{ flex: 1 }}>
            <Text strong>Étapes du pipeline commercial</Text>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
              Glissez-déposez les lignes pour réordonner les colonnes du Kanban.
            </Paragraph>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => fetchStages()}>Actualiser</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Nouvelle étape
          </Button>
        </Space>
      </Card>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="stages-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {/* On garde la Table pour les en-têtes et le style, mais on
                  rend chaque ligne via Draggable. Approche pragmatique. */}
              <Table
                rowKey="id"
                columns={columns}
                dataSource={stages}
                loading={loading}
                pagination={false}
                size="middle"
                components={{
                  body: {
                    wrapper: (props: { children: React.ReactNode }) => (
                      <tbody {...props}>{props.children}</tbody>
                    ),
                    row: (props: { "data-row-key"?: string; children: React.ReactNode; className?: string }) => {
                      const key = props["data-row-key"];
                      const idx = stages.findIndex((s) => s.id === key);
                      if (idx < 0 || !key) return <tr {...props} />;
                      return (
                        <Draggable draggableId={key} index={idx} key={key}>
                          {(drag, snapshot) => (
                            <tr
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              className={`${props.className ?? ""} ${snapshot.isDragging ? "drag-active" : ""}`}
                              style={{
                                ...drag.draggableProps.style,
                                background: snapshot.isDragging ? "#e6f4ff" : undefined,
                              }}
                            >
                              {props.children}
                            </tr>
                          )}
                        </Draggable>
                      );
                    },
                  },
                }}
              />
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Création */}
      <Modal
        title={<Space><ProjectOutlined /><span>Nouvelle étape</span></Space>}
        open={createOpen}
        onOk={() => void createStage()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={saving}
        okText="Créer"
        cancelText="Annuler"
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }} initialValues={{ color: DEFAULT_COLORS[0] }}>
          <Form.Item name="name" label="Nom de l'étape" rules={[{ required: true, max: 60 }]}>
            <Input placeholder="ex. Démo planifiée" />
          </Form.Item>
          <Form.Item name="color" label="Couleur">
            <ColorPicker presets={[{ label: "Couleurs", colors: DEFAULT_COLORS }]} showText />
          </Form.Item>
        </Form>
      </Modal>

      {/* Renommer */}
      <Modal
        title="Modifier l'étape"
        open={!!editTarget}
        onOk={() => void saveEdit()}
        onCancel={() => setEditTarget(null)}
        confirmLoading={saving}
        okText="Enregistrer"
        cancelText="Annuler"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nom" rules={[{ required: true, max: 60 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="Couleur">
            <ColorPicker presets={[{ label: "Couleurs", colors: DEFAULT_COLORS }]} showText />
          </Form.Item>
        </Form>
      </Modal>

      {/* Suppression sécurisée */}
      <Modal
        title="Supprimer l'étape"
        open={!!deleteTarget}
        onOk={() => void confirmDelete()}
        onCancel={() => { setDeleteTarget(null); setReassignTo(undefined); }}
        confirmLoading={saving}
        okText="Supprimer"
        okButtonProps={{ danger: true }}
        cancelText="Annuler"
      >
        {deleteTarget && (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Paragraph>
              Supprimer définitivement l'étape <Text strong>« {deleteTarget.name} »</Text> ?
            </Paragraph>
            {deleteTarget.leadCount > 0 ? (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message={`Cette étape contient ${deleteTarget.leadCount} lead(s).`}
                  description="Choisissez où les réassigner, sinon ils seront détachés (pas supprimés)."
                />
                <div>
                  <Text strong>Réassigner les leads à :</Text>
                  <Select
                    allowClear
                    style={{ width: "100%", marginTop: 8 }}
                    placeholder="(détacher les leads)"
                    value={reassignTo}
                    onChange={setReassignTo}
                    options={stages
                      .filter((s) => s.id !== deleteTarget.id)
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>
              </>
            ) : (
              <Alert type="info" message="Aucun lead n'est rattaché à cette étape." />
            )}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
