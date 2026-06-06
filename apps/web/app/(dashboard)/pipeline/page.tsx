"use client";

/**
 * Page /pipeline — vue Kanban des leads par étape commerciale.
 *
 * - Colonnes = étapes (ordonnées par PipelineStage.order).
 * - Drag-drop d'un lead vers une colonne → POST /api/leads/:id/pipeline-stage.
 *   Si l'étape cible mappe un statut standard, Lead.status est aussi synchronisé.
 * - Filtres : commercial assigné, source, tag, score minimum (PL-04).
 * - Bandeau de métriques : total leads, taux conversion par étape, durée moy. (PL-05).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar, Badge, Button, Card, Empty, Input, message, Select, Space, Spin,
  Statistic, Tag, Tooltip, Typography, Modal, Form, ColorPicker, Alert,
} from "antd";
import {
  FilterOutlined, ProjectOutlined, ReloadOutlined, SearchOutlined, TrophyOutlined,
  UserOutlined, RiseOutlined, ClockCircleOutlined, PlusOutlined, DeleteOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { api } from "@/lib/client";

const { Text, Title, Paragraph } = Typography;

const DEFAULT_COLORS = ["#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2", "#eb2f96", "#f5222d", "#595959"];

type Stage = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  leadCount: number;
};

type Lead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email?: string | null;
  source: string | null;
  status: string;
  score: number;
  tags: string[];
  assignedToId: string | null;
  pipelineStageId: string | null;
  lastActionAt: string | null;
};

type UserOption = { id: string; name: string; email: string };

type StageMetric = {
  id: string;
  name: string;
  color: string | null;
  count: number;
  avgDaysInStage: number | null;
  conversionRateFromPrevious: number | null;
};

type Metrics = {
  totalLeads: number;
  stages: StageMetric[];
  winRate: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  NOUVEAU: "default",
  CONTACTE: "blue",
  QUALIFIE: "cyan",
  EN_DISCUSSION: "purple",
  CONVERTI: "green",
  PERDU: "red",
};

// Repli statut → étape : un lead sans étape explicite est affiché dans la
// colonne standard correspondant à son statut (sinon il serait invisible).
const STAGE_NAMES_BY_STATUS: Record<string, string[]> = {
  NOUVEAU: ["Nouveau"],
  CONTACTE: ["Contacté", "Contacte"],
  QUALIFIE: ["Qualifié", "Qualifie"],
  EN_DISCUSSION: ["En discussion", "Négociation", "Negociation"],
  CONVERTI: ["Gagné", "Gagne", "Converti"],
  PERDU: ["Perdu"],
};

function initials(l: Lead): string {
  const parts = [l.firstName, l.lastName].filter(Boolean) as string[];
  if (parts.length > 0) return parts.map((p) => p[0]!.toUpperCase()).join("").slice(0, 2);
  if (l.company) return l.company.slice(0, 2).toUpperCase();
  return "??";
}

function fullName(l: Lead): string {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "(sans nom)";
}

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterAssignee, setFilterAssignee] = useState<string | undefined>();
  const [filterSource, setFilterSource] = useState<string | undefined>();
  const [filterTag, setFilterTag] = useState<string | undefined>();
  const [filterScoreMin, setFilterScoreMin] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canManagePipeline, setCanManagePipeline] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);
  const [reassignTo, setReassignTo] = useState<string | undefined>();
  const [stageSaving, setStageSaving] = useState(false);
  const [createForm] = Form.useForm();

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("pageSize", "200");
    if (filterAssignee) params.set("assignedToId", filterAssignee);
    if (filterSource) params.set("source", filterSource);
    if (filterTag) params.set("tag", filterTag);
    if (filterScoreMin != null) params.set("scoreMin", String(filterScoreMin));
    if (search.trim()) params.set("q", search.trim());
    try {
      const { data } = await api.get<{ data: Lead[] }>(`/leads?${params.toString()}`);
      setLeads(data.data);
    } catch {
      message.error("Impossible de charger les leads.");
    }
  }, [filterAssignee, filterSource, filterTag, filterScoreMin, search]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesRes, metricsRes, usersRes] = await Promise.all([
        api.get<{ data: Stage[] }>("/pipeline-stages"),
        api.get<{ data: Metrics }>("/pipeline/metrics"),
        api.get<{ data: UserOption[] }>("/users"),
      ]);
      setStages(stagesRes.data.data);
      setMetrics(metricsRes.data.data);
      setUsers(usersRes.data.data);
      await fetchLeads();
    } catch {
      message.error("Erreur de chargement de la vue pipeline.");
    } finally {
      setLoading(false);
    }
  }, [fetchLeads]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get<{ permissions: string[] }>("/auth/me")
      .then(({ data }) => setCanManagePipeline(data.permissions.includes("pipeline:manage")))
      .catch(() => setCanManagePipeline(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchLeads(); }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, fetchLeads]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [leads]);
  const allSources = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => { if (l.source) set.add(l.source); });
    return Array.from(set).sort();
  }, [leads]);

  const effectiveStageId = useCallback(
    (lead: Lead): string | null => {
      if (lead.pipelineStageId && stages.some((s) => s.id === lead.pipelineStageId)) {
        return lead.pipelineStageId;
      }
      for (const name of STAGE_NAMES_BY_STATUS[lead.status] ?? []) {
        const found = stages.find(
          (s) => s.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (found) return found.id;
      }
      return null;
    },
    [stages],
  );

  const leadsByStage = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const stage of stages) m.set(stage.id, []);
    for (const lead of leads) {
      const sid = effectiveStageId(lead);
      if (sid && m.has(sid)) m.get(sid)!.push(lead);
    }
    return m;
  }, [stages, leads, effectiveStageId]);

  const unassignedCount = useMemo(
    () => leads.filter((l) => effectiveStageId(l) == null).length,
    [leads, effectiveStageId],
  );

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStageId = destination.droppableId;
    const oldStageId = source.droppableId;

    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, pipelineStageId: newStageId } : l)),
    );

    try {
      const { data } = await api.post<{
        data: { leadId: string; stageId: string; status: string; statusChanged: boolean };
      }>(`/leads/${draggableId}/pipeline-stage`, {
        stageId: newStageId,
        position: destination.index,
      });
      if (data.data.statusChanged) {
        setLeads((prev) =>
          prev.map((l) => (l.id === draggableId ? { ...l, status: data.data.status } : l)),
        );
        message.success(`Statut mis à jour : ${data.data.status}`, 2);
      }
      try {
        const { data: m } = await api.get<{ data: Metrics }>("/pipeline/metrics");
        setMetrics(m.data);
      } catch { /* non bloquant */ }
    } catch (e) {
      setLeads((prev) =>
        prev.map((l) => (l.id === draggableId ? { ...l, pipelineStageId: oldStageId } : l)),
      );
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(`Déplacement impossible : ${msg}`);
    }
  }

  function resetFilters() {
    setFilterAssignee(undefined);
    setFilterSource(undefined);
    setFilterTag(undefined);
    setFilterScoreMin(undefined);
    setSearch("");
  }

  async function createStage() {
    const values = await createForm.validateFields();
    setStageSaving(true);
    try {
      const color =
        typeof values.color === "object" && values.color?.toHexString
          ? values.color.toHexString()
          : values.color ?? DEFAULT_COLORS[0];
      await api.post("/pipeline-stages", { name: values.name, color });
      message.success("Colonne ajoutée");
      createForm.resetFields();
      setCreateOpen(false);
      await fetchAll();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setStageSaving(false);
    }
  }

  async function confirmDeleteStage() {
    if (!deleteTarget) return;
    setStageSaving(true);
    try {
      const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
      await api.delete(`/pipeline-stages/${deleteTarget.id}${qs}`);
      message.success(`Colonne « ${deleteTarget.name} » supprimée`);
      setDeleteTarget(null);
      setReassignTo(undefined);
      await fetchAll();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    } finally {
      setStageSaving(false);
    }
  }

  return (
    <div style={{ padding: "16px 24px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 16 }}>
        <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
          <Space>
            <ProjectOutlined style={{ fontSize: 24, color: "#1677ff" }} />
            <Title level={3} style={{ margin: 0 }}>Pipeline commercial</Title>
            {unassignedCount > 0 && (
              <Tag color="warning" style={{ marginLeft: 8 }}>
                {unassignedCount} lead(s) sans étape
              </Tag>
            )}
          </Space>
          <Space>
            {canManagePipeline && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Ajouter une colonne
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>
          </Space>
        </Space>
      </div>

      {metrics && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space size={32} wrap>
            <Statistic
              title="Total leads en pipeline"
              value={metrics.totalLeads}
              valueStyle={{ fontSize: 22, color: "#1677ff" }}
              prefix={<ProjectOutlined />}
            />
            {metrics.winRate != null && (
              <Statistic
                title="Taux de conversion global"
                value={metrics.winRate}
                suffix="%"
                valueStyle={{ fontSize: 22, color: "#52c41a" }}
                prefix={<TrophyOutlined />}
              />
            )}
            <Statistic
              title="Étapes configurées"
              value={stages.length}
              valueStyle={{ fontSize: 22 }}
            />
          </Space>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Space>
            <FilterOutlined />
            <Text strong>Filtres</Text>
          </Space>
          <Input.Search
            placeholder="Rechercher (nom, entreprise…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="Commercial assigné"
            allowClear
            value={filterAssignee}
            onChange={setFilterAssignee}
            style={{ width: 200 }}
            showSearch
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            filterOption={(input, opt) =>
              String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            placeholder="Source"
            allowClear
            value={filterSource}
            onChange={setFilterSource}
            style={{ width: 180 }}
            options={allSources.map((s) => ({ value: s, label: s }))}
          />
          <Select
            placeholder="Tag"
            allowClear
            value={filterTag}
            onChange={setFilterTag}
            style={{ width: 160 }}
            options={allTags.map((t) => ({ value: t, label: t }))}
          />
          <Select
            placeholder="Score min."
            allowClear
            value={filterScoreMin}
            onChange={(v) => setFilterScoreMin(v as number | undefined)}
            style={{ width: 130 }}
            options={[0, 20, 40, 60, 80].map((v) => ({ value: v, label: `≥ ${v}` }))}
          />
          <Button onClick={resetFilters}>Réinitialiser</Button>
        </Space>
      </Card>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin size="large" tip="Chargement du pipeline…" />
        </div>
      ) : stages.length === 0 ? (
        <Empty
          description={
            canManagePipeline ? (
              <>
                Aucune colonne configurée.{" "}
                <Button type="link" style={{ padding: 0 }} onClick={() => setCreateOpen(true)}>
                  Ajouter la première colonne
                </Button>
              </>
            ) : (
              <>Aucune colonne configurée. Contactez un administrateur.</>
            )
          }
        />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              padding: "4px 0 12px",
              flex: 1,
              minHeight: 0,
            }}
          >
            {stages.map((stage) => {
              const stageLeads = leadsByStage.get(stage.id) ?? [];
              const metric = metrics?.stages.find((m) => m.id === stage.id);
              return (
                <div
                  key={stage.id}
                  style={{
                    flex: "0 0 320px",
                    minWidth: 320,
                    display: "flex",
                    flexDirection: "column",
                    background: "#fafafa",
                    borderRadius: 8,
                    border: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #f0f0f0",
                      background: "#fff",
                      borderRadius: "8px 8px 0 0",
                    }}
                  >
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <Space>
                        <div
                          style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: stage.color ?? "#d9d9d9",
                          }}
                        />
                        <Text strong>{stage.name}</Text>
                        <Badge count={stageLeads.length} showZero color={stage.color ?? "#bfbfbf"} />
                      </Space>
                      {canManagePipeline && (
                        <Tooltip title="Supprimer cette colonne">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => setDeleteTarget(stage)}
                          />
                        </Tooltip>
                      )}
                    </Space>
                    {metric && (
                      <Space size={12} style={{ marginTop: 4 }}>
                        {metric.conversionRateFromPrevious != null && (
                          <Tooltip title="Taux de conversion depuis l'étape précédente">
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <RiseOutlined /> {metric.conversionRateFromPrevious}%
                            </Text>
                          </Tooltip>
                        )}
                        {metric.avgDaysInStage != null && (
                          <Tooltip title="Durée moyenne dans cette étape">
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <ClockCircleOutlined /> {metric.avgDaysInStage}j
                            </Text>
                          </Tooltip>
                        )}
                      </Space>
                    )}
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1,
                          padding: 8,
                          minHeight: 100,
                          background: snapshot.isDraggingOver ? "#e6f4ff" : "transparent",
                          transition: "background-color 0.2s",
                          overflowY: "auto",
                        }}
                      >
                        {stageLeads.length === 0 && !snapshot.isDraggingOver && (
                          <div style={{ textAlign: "center", color: "#bfbfbf", fontSize: 12, padding: "24px 8px" }}>
                            Aucun lead
                          </div>
                        )}
                        {stageLeads.map((lead, idx) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={idx}>
                            {(drag, dragSnap) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                {...drag.dragHandleProps}
                                style={{ ...drag.draggableProps.style, marginBottom: 8 }}
                              >
                                <Card
                                  size="small"
                                  hoverable
                                  styles={{ body: { padding: 12 } }}
                                  style={{
                                    boxShadow: dragSnap.isDragging
                                      ? "0 4px 12px rgba(0,0,0,0.15)"
                                      : undefined,
                                    cursor: "grab",
                                  }}
                                >
                                  <Link href={`/leads/${lead.id}`} style={{ color: "inherit" }}>
                                    <Space align="start" size={8} style={{ width: "100%" }}>
                                      <Avatar
                                        size="small"
                                        style={{ background: "#1677ff", fontSize: 11, flexShrink: 0 }}
                                      >
                                        {initials(lead)}
                                      </Avatar>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text strong style={{ display: "block", fontSize: 13 }}>
                                          {fullName(lead)}
                                        </Text>
                                        {lead.company && (
                                          <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                                            {lead.company}
                                          </Text>
                                        )}
                                        <Space size={4} wrap style={{ marginTop: 4 }}>
                                          <Tag color={STATUS_COLORS[lead.status] ?? "default"} style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
                                            {lead.status}
                                          </Tag>
                                          {lead.score > 0 && (
                                            <Tag color={lead.score >= 60 ? "green" : lead.score >= 40 ? "blue" : "default"} style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
                                              {lead.score}
                                            </Tag>
                                          )}
                                          {lead.assignedToId && (
                                            <Tooltip title={users.find((u) => u.id === lead.assignedToId)?.name ?? "?"}>
                                              <Tag icon={<UserOutlined />} style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
                                                {users.find((u) => u.id === lead.assignedToId)?.name?.split(" ").map((p) => p[0]).join("") ?? "?"}
                                              </Tag>
                                            </Tooltip>
                                          )}
                                        </Space>
                                        {lead.tags && lead.tags.length > 0 && (
                                          <Space size={2} wrap style={{ marginTop: 4 }}>
                                            {lead.tags.slice(0, 2).map((t) => (
                                              <Tag key={t} style={{ fontSize: 10, lineHeight: "14px", margin: 0, padding: "0 4px" }}>
                                                {t}
                                              </Tag>
                                            ))}
                                            {lead.tags.length > 2 && (
                                              <Text type="secondary" style={{ fontSize: 10 }}>
                                                +{lead.tags.length - 2}
                                              </Text>
                                            )}
                                          </Space>
                                        )}
                                      </div>
                                    </Space>
                                  </Link>
                                </Card>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
            {canManagePipeline && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                style={{
                  flex: "0 0 200px",
                  minWidth: 200,
                  minHeight: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "#fafafa",
                  borderRadius: 8,
                  border: "2px dashed #d9d9d9",
                  cursor: "pointer",
                  color: "#8c8c8c",
                  transition: "border-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#1677ff";
                  e.currentTarget.style.color = "#1677ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#d9d9d9";
                  e.currentTarget.style.color = "#8c8c8c";
                }}
              >
                <PlusOutlined style={{ fontSize: 24 }} />
                <Text type="secondary">Ajouter une colonne</Text>
              </button>
            )}
          </div>
        </DragDropContext>
      )}

      <Modal
        title={<Space><PlusOutlined /><span>Nouvelle colonne</span></Space>}
        open={createOpen}
        onOk={() => void createStage()}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={stageSaving}
        okText="Créer"
        cancelText="Annuler"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }} initialValues={{ color: DEFAULT_COLORS[0] }}>
          <Form.Item name="name" label="Nom de la colonne" rules={[{ required: true, max: 60 }]}>
            <Input placeholder="ex. Démo planifiée" />
          </Form.Item>
          <Form.Item name="color" label="Couleur">
            <ColorPicker presets={[{ label: "Couleurs", colors: DEFAULT_COLORS }]} showText />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Supprimer la colonne"
        open={!!deleteTarget}
        onOk={() => void confirmDeleteStage()}
        onCancel={() => { setDeleteTarget(null); setReassignTo(undefined); }}
        confirmLoading={stageSaving}
        okText="Supprimer"
        okButtonProps={{ danger: true }}
        cancelText="Annuler"
        destroyOnHidden
      >
        {deleteTarget && (
          <Space direction="vertical" style={{ width: "100%" }} size={12}>
            <Paragraph style={{ marginBottom: 0 }}>
              Supprimer la colonne <Text strong>« {deleteTarget.name} »</Text> ?
            </Paragraph>
            {deleteTarget.leadCount > 0 ? (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message={`Cette colonne contient ${deleteTarget.leadCount} lead(s).`}
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
              <Alert type="info" message="Aucun lead dans cette colonne." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
