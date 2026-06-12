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
import { Avatar, Badge, Button, Card, Empty, Input, Select, Space, Spin, Statistic, Tag, Tooltip, Typography, Modal, Form, ColorPicker, Alert } from "antd";
import {
  FilterOutlined, ProjectOutlined, ReloadOutlined, SearchOutlined, TrophyOutlined,
  UserOutlined, RiseOutlined, ClockCircleOutlined, PlusOutlined, DeleteOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { api } from "@/lib/client";
import { labelWithHelp } from "@/components/ui/FieldHelp";
import { LeadPipelineDrawer } from "@/components/leads/LeadPipelineDrawer";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Text, Title, Paragraph } = Typography;

const DEFAULT_COLORS = ["#1677ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2", "#eb2f96", "#f5222d", "#595959"];

const DRAG_TYPE_COLUMN = "COLUMN";
const DRAG_TYPE_CARD = "CARD";

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
  businessPotentialEur?: number | null;
  assignedToId: string | null;
  pipelineStageId: string | null;
  lastActionAt: string | null;
};

type UserOption = { id: string; name: string; email: string; role?: string };

type StageMetric = {
  id: string;
  name: string;
  color: string | null;
  count: number;
  avgDaysInStage: number | null;
  conversionRateFromPrevious: number | null;
  totalBusinessPotentialEur?: number;
  avgBusinessPotentialEur?: number | null;
};

type Metrics = {
  totalLeads: number;
  totalBusinessPotentialEur?: number;
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
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pipelineOwnerId, setPipelineOwnerId] = useState<string | undefined>(undefined);
  const [pipelineReadOnly, setPipelineReadOnly] = useState(false);

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
    } catch (e) { notifyApiError(e, "Impossible de charger les leads."); }
  }, [filterAssignee, filterSource, filterTag, filterScoreMin, search]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const ownerQs = pipelineOwnerId ? `?ownerUserId=${encodeURIComponent(pipelineOwnerId)}` : "";
      const [stagesRes, metricsRes, usersRes] = await Promise.all([
        api.get<{ data: Stage[]; readOnly?: boolean; ownerUserId?: string }>(`/pipeline-stages${ownerQs}`),
        api.get<{ data: Metrics }>(`/pipeline/metrics${ownerQs}`),
        api.get<{ data: UserOption[] }>("/users"),
      ]);
      setStages(stagesRes.data.data);
      setPipelineReadOnly(Boolean(stagesRes.data.readOnly));
      setMetrics(metricsRes.data.data);
      setUsers(usersRes.data.data);
      await fetchLeads();
    } catch (e) { notifyApiError(e, "Erreur de chargement de la vue pipeline."); } finally {
      setLoading(false);
    }
  }, [fetchLeads, pipelineOwnerId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get<{ permissions: string[]; role?: string }>("/auth/me")
      .then(({ data }) => {
        setCanManagePipeline(data.permissions.includes("pipeline:manage"));
        setIsAdmin(data.role === "ADMIN");
      })
      .catch(() => {
        setCanManagePipeline(false);
        setIsAdmin(false);
      });
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

  async function onColumnDragEnd(result: DropResult) {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const previousStages = stages;
    const next = Array.from(stages);
    const [moved] = next.splice(source.index, 1);
    if (!moved) return;
    next.splice(destination.index, 0, moved);
    setStages(next.map((s, idx) => ({ ...s, order: idx })));

    try {
      await api.put("/pipeline-stages/reorder", { orderedIds: next.map((s) => s.id) });
    } catch (e) {
      setStages(previousStages);
      notifyApiError(e, "Réorganisation impossible");
    }
  }

  async function onLeadDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStageId = destination.droppableId;
    const leadBefore = leads.find((l) => l.id === draggableId);
    const previousPipelineStageId = leadBefore?.pipelineStageId ?? null;

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
        notifySuccess(`Statut mis à jour : ${data.data.status}`);
      }
      try {
        const ownerQs = pipelineOwnerId ? `?ownerUserId=${encodeURIComponent(pipelineOwnerId)}` : "";
        const { data: m } = await api.get<{ data: Metrics }>(`/pipeline/metrics${ownerQs}`);
        setMetrics(m.data);
      } catch { /* non bloquant */ }
    } catch (e) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === draggableId ? { ...l, pipelineStageId: previousPipelineStageId } : l,
        ),
      );
      notifyApiError(e, "Déplacement impossible");
    }
  }

  function onDragEnd(result: DropResult) {
    if (pipelineReadOnly || !canManagePipeline) return;
    if (!result.destination) return;
    const isColumnDrag =
      result.type === DRAG_TYPE_COLUMN || result.draggableId.startsWith("column-");
    if (isColumnDrag) {
      void onColumnDragEnd(result);
    } else {
      void onLeadDragEnd(result);
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
      notifySuccess("Colonne ajoutée");
      createForm.resetFields();
      setCreateOpen(false);
      await fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setStageSaving(false);
    }
  }

  async function confirmDeleteStage() {
    if (!deleteTarget) return;
    const removed = deleteTarget;
    setStageSaving(true);
    try {
      const qs = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
      await api.delete(`/pipeline-stages/${removed.id}${qs}`);
      setStages((prev) => prev.filter((s) => s.id !== removed.id));
      notifySuccess(`Colonne « ${removed.name} » supprimée`);
      setDeleteTarget(null);
      setReassignTo(undefined);
      await fetchAll();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setStageSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: "16px 24px",
        height: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
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
          <Space wrap>
            {isAdmin && (
              <Select
                allowClear
                placeholder="Mon pipeline"
                style={{ minWidth: 220 }}
                value={pipelineOwnerId}
                onChange={(v) => setPipelineOwnerId(v)}
                options={users
                  .filter((u) => u.role && u.role !== "ADMIN")
                  .map((u) => ({ value: u.id, label: `Pipeline : ${u.name}` }))}
              />
            )}
            {canManagePipeline && !pipelineReadOnly && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Ajouter une colonne
              </Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>
          </Space>
        </Space>
      </div>

      {pipelineReadOnly && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Vue en lecture seule"
          description="Vous consultez le pipeline d'un collaborateur. Ses emails, IMAP et paramètres OpenAI restent privés."
        />
      )}

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
            {(metrics.totalBusinessPotentialEur ?? 0) > 0 && (
              <Statistic
                title="Potentiel pipeline"
                value={metrics.totalBusinessPotentialEur}
                suffix="€"
                valueStyle={{ fontSize: 22, color: "#fa8c16" }}
                prefix={<RiseOutlined />}
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
              flex: 1,
              minHeight: 0,
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 8,
            }}
          >
          <Droppable droppableId="pipeline-columns" direction="horizontal" type={DRAG_TYPE_COLUMN}>
            {(columnsProvided) => (
          <div
            ref={columnsProvided.innerRef}
            {...columnsProvided.droppableProps}
            style={{
              display: "flex",
              gap: 12,
              height: "100%",
              minHeight: 420,
              padding: "4px 4px 12px",
              alignItems: "stretch",
            }}
          >
            {stages.map((stage, stageIndex) => {
              const stageLeads = leadsByStage.get(stage.id) ?? [];
              const metric = metrics?.stages.find((m) => m.id === stage.id);
              return (
                <Draggable
                  key={stage.id}
                  draggableId={`column-${stage.id}`}
                  index={stageIndex}
                  isDragDisabled={pipelineReadOnly || !canManagePipeline}
                >
                  {(colProvided, colSnapshot) => (
                <div
                  ref={colProvided.innerRef}
                  {...colProvided.draggableProps}
                  style={{
                    ...colProvided.draggableProps.style,
                    flex: "0 0 320px",
                    minWidth: 320,
                    maxHeight: "100%",
                    display: "flex",
                    flexDirection: "column",
                    background: "#fafafa",
                    borderRadius: 8,
                    border: colSnapshot.isDragging ? "1px solid #1677ff" : "1px solid #f0f0f0",
                    boxShadow: colSnapshot.isDragging ? "0 4px 16px rgba(0,0,0,0.12)" : undefined,
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
                        {canManagePipeline && !pipelineReadOnly && (
                          <Tooltip title="Glisser pour réordonner la colonne">
                            <span
                              {...colProvided.dragHandleProps}
                              style={{
                                cursor: colSnapshot.isDragging ? "grabbing" : "grab",
                                color: "#bfbfbf",
                                display: "inline-flex",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <HolderOutlined />
                            </span>
                          </Tooltip>
                        )}
                        <div
                          style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: stage.color ?? "#d9d9d9",
                          }}
                        />
                        <Text strong>{stage.name}</Text>
                        <Badge count={stageLeads.length} showZero color={stage.color ?? "#bfbfbf"} />
                      </Space>
                      {canManagePipeline && !pipelineReadOnly && (
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
                        {(metric.totalBusinessPotentialEur ?? 0) > 0 && (
                          <Tooltip title="Potentiel commercial total dans cette colonne">
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <RiseOutlined /> {metric.totalBusinessPotentialEur?.toLocaleString("fr-FR")} €
                            </Text>
                          </Tooltip>
                        )}
                      </Space>
                    )}
                  </div>

                  <Droppable droppableId={stage.id} type={DRAG_TYPE_CARD}>
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
                          <Draggable
                            key={lead.id}
                            draggableId={lead.id}
                            index={idx}
                            isDragDisabled={pipelineReadOnly || !canManagePipeline}
                          >
                            {(drag, dragSnap) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
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
                                    cursor: dragSnap.isDragging ? "grabbing" : "default",
                                  }}
                                  onClick={() => {
                                    if (!dragSnap.isDragging) setDrawerLeadId(lead.id);
                                  }}
                                >
                                    <Space align="start" size={8} style={{ width: "100%" }}>
                                      {canManagePipeline && !pipelineReadOnly && (
                                        <span
                                          {...drag.dragHandleProps}
                                          style={{
                                            cursor: dragSnap.isDragging ? "grabbing" : "grab",
                                            color: "#bfbfbf",
                                            paddingTop: 2,
                                            flexShrink: 0,
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <HolderOutlined />
                                        </span>
                                      )}
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
                                        {(lead.businessPotentialEur ?? 0) > 0 && (
                                          <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                                            {lead.businessPotentialEur!.toLocaleString("fr-FR")} €
                                          </Text>
                                        )}
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
                  )}
                </Draggable>
              );
            })}
            {columnsProvided.placeholder}
            {canManagePipeline && !pipelineReadOnly && (
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
            )}
          </Droppable>
          </div>
        </DragDropContext>
      )}

      <LeadPipelineDrawer
        leadId={drawerLeadId}
        open={!!drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
        stages={stages}
        onUpdated={() => void fetchAll()}
      />

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
          <Form.Item name="name" label={labelWithHelp("Nom de la colonne", "Étape du pipeline commercial. Les leads peuvent être déplacés entre colonnes par glisser-déposer.")} rules={[{ required: true, max: 60 }]}>
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
            {(leadsByStage.get(deleteTarget.id)?.length ?? deleteTarget.leadCount) > 0 ? (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message={`Cette colonne contient ${leadsByStage.get(deleteTarget.id)?.length ?? deleteTarget.leadCount} lead(s).`}
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
