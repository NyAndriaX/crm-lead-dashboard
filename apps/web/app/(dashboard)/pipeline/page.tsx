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
  Button, Col, Input, message, Row, Select, Spin, Tooltip,
} from "antd";
import {
  FilterOutlined, ProjectOutlined, ReloadOutlined, SearchOutlined, TrophyOutlined,
  UserOutlined, ClockCircleOutlined, AppstoreOutlined, RightOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { api } from "@/lib/client";
import { STATUS_LABELS } from "@/lib/leadStatus";
import { palette, statusColors } from "@/lib/theme";
import { stageColor } from "@/lib/stageColor";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Chip, EmptyState, Panel, ScoreRing, scoreColor } from "@/components/ui/Kit";

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

  const totalInStages = stages.reduce((s, st) => s + (leadsByStage.get(st.id)?.length ?? 0), 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        icon={<ProjectOutlined />}
        title="Pipeline"
        highlight="commercial"
        subtitle="Glissez-déposez les leads d'une étape à l'autre — le statut suit automatiquement."
        badges={unassignedCount > 0 ? <Chip color={palette.amber} dot>{unassignedCount} lead(s) sans étape</Chip> : undefined}
        extra={<Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>}
      />

      {metrics && (
        <Row gutter={[16, 16]} className="nb-stagger">
          <Col xs={24} md={8}><StatCard label="Leads en pipeline" value={metrics.totalLeads} icon={<ProjectOutlined />} color={palette.violet} /></Col>
          <Col xs={24} md={8}><StatCard label="Taux de conversion" value={metrics.winRate ?? 0} decimals={1} suffix="%" icon={<TrophyOutlined />} color={palette.green} hint="Leads gagnés / leads sortis du pipeline" /></Col>
          <Col xs={24} md={8}><StatCard label="Étapes actives" value={stages.length} icon={<AppstoreOutlined />} color={palette.cyan} hint={`${totalInStages} leads répartis`} /></Col>
        </Row>
      )}

      {/* Flux d'étapes : volume et taux de passage */}
      {stages.length > 0 && (
        <div className="nb-glass" style={{ borderRadius: 20, padding: "18px 18px", overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, minWidth: stages.length * 150 }}>
            {stages.map((stage, i) => {
              const c = stageColor(stage.color, i);
              const count = leadsByStage.get(stage.id)?.length ?? 0;
              const metric = metrics?.stages.find((m) => m.id === stage.id);
              return (
                <div key={stage.id} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                  <div
                    className="nb-fade-up"
                    style={{
                      flex: 1, minWidth: 0, borderRadius: 16, padding: "12px 14px", position: "relative", overflow: "hidden",
                      background: `linear-gradient(135deg, ${c}2e, ${c}0d)`, border: `1px solid ${c}55`,
                      animationDelay: `${i * 0.06}s`,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {stage.name}
                    </div>
                    <div className="nb-display nb-mono" style={{ fontSize: 28, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.2 }}>{count}</div>
                    <div style={{ fontSize: 11, color: "var(--nb-text-3)", whiteSpace: "nowrap" }}>
                      {metric?.avgDaysInStage != null ? <><ClockCircleOutlined /> {metric.avgDaysInStage} j moy.</> : "—"}
                    </div>
                  </div>
                  {i < stages.length - 1 && (
                    <div style={{ width: 54, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span className="nb-mono" style={{ fontSize: 11, fontWeight: 700, color: metrics?.stages.find((m) => m.id === stages[i + 1]!.id)?.conversionRateFromPrevious != null ? scoreColor(metrics?.stages.find((m) => m.id === stages[i + 1]!.id)?.conversionRateFromPrevious) : "var(--nb-text-3)" }}>
                        {metrics?.stages.find((m) => m.id === stages[i + 1]!.id)?.conversionRateFromPrevious ?? "—"}
                        {metrics?.stages.find((m) => m.id === stages[i + 1]!.id)?.conversionRateFromPrevious != null ? "%" : ""}
                      </span>
                      <RightOutlined style={{ color: "var(--nb-text-3)", fontSize: 12 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="nb-glass" style={{ borderRadius: 18, padding: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--nb-text-2)", fontWeight: 600, paddingLeft: 6 }}>
          <FilterOutlined /> Filtres
        </span>
        <Input
          prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />}
          placeholder="Rechercher (nom, entreprise…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 240 }}
        />
        <Select
          placeholder="Commercial assigné"
          allowClear
          value={filterAssignee}
          onChange={setFilterAssignee}
          style={{ width: 190 }}
          showSearch
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
        />
        <Select placeholder="Source" allowClear value={filterSource} onChange={setFilterSource} style={{ width: 170 }} options={allSources.map((s) => ({ value: s, label: s }))} />
        <Select placeholder="Tag" allowClear value={filterTag} onChange={setFilterTag} style={{ width: 160 }} options={allTags.map((t) => ({ value: t, label: t }))} />
        <Select
          placeholder="Score min."
          allowClear
          value={filterScoreMin}
          onChange={(v) => setFilterScoreMin(v as number | undefined)}
          style={{ width: 130 }}
          options={[0, 20, 40, 60, 80].map((v) => ({ value: v, label: `≥ ${v}` }))}
        />
        <Button type="text" onClick={resetFilters}>Réinitialiser</Button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
          <Spin size="large" />
        </div>
      ) : stages.length === 0 ? (
        <Panel>
          <EmptyState
            title="Aucune étape configurée"
            description="Définissez les étapes de votre cycle de vente pour activer le Kanban."
            action={<Link href="/settings"><Button type="primary">Configurer les étapes</Button></Link>}
          />
        </Panel>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
            {stages.map((stage, si) => {
              const c = stageColor(stage.color, si);
              const stageLeads = leadsByStage.get(stage.id) ?? [];
              return (
                <div
                  key={stage.id}
                  className="nb-fade-up"
                  style={{
                    flex: "0 0 300px", minWidth: 300, display: "flex", flexDirection: "column", borderRadius: 20, overflow: "hidden",
                    background: `linear-gradient(180deg, ${c}1f 0%, ${c}08 30%, var(--nb-surface) 100%)`,
                    border: `1px solid ${c}40`, backdropFilter: "blur(14px)", animationDelay: `${si * 0.05}s`,
                  }}
                >
                  <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${c}33` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 12px ${c}`, flexShrink: 0 }} />
                      <span className="nb-display" style={{ fontWeight: 600, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stage.name}</span>
                    </div>
                    <span className="nb-mono" style={{ fontSize: 12, fontWeight: 700, color: c, background: `${c}1f`, padding: "2px 10px", borderRadius: 999 }}>
                      {stageLeads.length}
                    </span>
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1, padding: 10, minHeight: 120, maxHeight: "calc(100vh - 260px)", overflowY: "auto",
                          background: snapshot.isDraggingOver ? `${c}1a` : "transparent", transition: "background-color 0.2s",
                          outline: snapshot.isDraggingOver ? `2px dashed ${c}80` : "none", outlineOffset: -6, borderRadius: 16,
                        }}
                      >
                        {stageLeads.length === 0 && !snapshot.isDraggingOver && (
                          <div style={{ textAlign: "center", color: "var(--nb-text-3)", fontSize: 12, padding: "28px 8px" }}>Déposez un lead ici</div>
                        )}
                        {stageLeads.map((lead, idx) => {
                          const assignee = users.find((u) => u.id === lead.assignedToId);
                          return (
                            <Draggable key={lead.id} draggableId={lead.id} index={idx}>
                              {(drag, dragSnap) => (
                                <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} style={{ ...drag.draggableProps.style, marginBottom: 10 }}>
                                  <Link href={`/leads/${lead.id}`} style={{ color: "inherit", display: "block" }}>
                                    <div
                                      className="nb-glass"
                                      style={{
                                        borderRadius: 14, padding: "12px 12px 12px 14px", position: "relative", overflow: "hidden", cursor: "grab",
                                        boxShadow: dragSnap.isDragging ? `0 22px 44px -12px rgba(0,0,0,0.5), 0 0 0 1.5px ${c}` : undefined,
                                        transform: dragSnap.isDragging ? "rotate(2deg) scale(1.02)" : undefined,
                                        transition: "transform 0.2s",
                                      }}
                                    >
                                      <span style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: c, boxShadow: `0 0 10px ${c}` }} />
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <div
                                          style={{
                                            width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                            fontSize: 12, fontWeight: 700, color: "#fff", background: `linear-gradient(135deg, ${c}, ${palette.violet})`,
                                          }}
                                        >
                                          {initials(lead)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName(lead)}</div>
                                          {lead.company && lead.company !== fullName(lead) && <div style={{ fontSize: 12, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company}</div>}
                                        </div>
                                        <ScoreRing score={lead.score} size={36} />
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10, alignItems: "center" }}>
                                        <Chip size="sm" color={statusColors[lead.status] ?? palette.violet}>
                                          {STATUS_LABELS[lead.status as keyof typeof STATUS_LABELS] ?? lead.status}
                                        </Chip>
                                        {lead.tags?.slice(0, 2).map((t) => (
                                          <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(148,163,184,0.12)", color: "var(--nb-text-2)" }}>{t}</span>
                                        ))}
                                        {(lead.tags?.length ?? 0) > 2 && <span style={{ fontSize: 11, color: "var(--nb-text-3)" }}>+{lead.tags.length - 2}</span>}
                                        {assignee && (
                                          <Tooltip title={`Assigné à ${assignee.name}`}>
                                            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nb-text-3)" }}>
                                              <UserOutlined /> {assignee.name.split(" ").map((p) => p[0]).join("")}
                                            </span>
                                          </Tooltip>
                                        )}
                                      </div>
                                    </div>
                                  </Link>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
