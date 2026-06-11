/**
 * Service Pipeline — gestion des étapes commerciales (PL-02), déplacement des
 * leads entre étapes (PL-03), métriques pipeline (PL-05).
 */
import {
  prisma,
  ensureDefaultPipelineStages,
  resolvePipelineOwnerId,
  buildPipelineLeadsWhere,
  strictOwnerWhere,
  assertLeadAccess,
  DataScopeError,
  type DataScope,
  type LeadStatus,
} from "@crm/db";

export type PipelineStageItem = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  leadCount: number;
  createdAt: Date;
};

/**
 * Mapping bi-directionnel statut <-> nom d'étape standard.
 * Si l'admin renomme une étape (ex. "Négociation" → "Pourparlers"), le mapping
 * cassera ; on récupère alors le `Lead.status` initial et on ne le change pas
 * lors du drag (le commercial peut le faire à la main).
 */
const STATUS_BY_STAGE_NAME: Record<string, LeadStatus> = {
  "Nouveau": "NOUVEAU",
  "Contacté": "CONTACTE",
  "Contacte": "CONTACTE",
  "Qualifié": "QUALIFIE",
  "Qualifie": "QUALIFIE",
  "Négociation": "EN_DISCUSSION",
  "Negociation": "EN_DISCUSSION",
  "En discussion": "EN_DISCUSSION",
  "Gagné": "CONVERTI",
  "Gagne": "CONVERTI",
  "Converti": "CONVERTI",
  "Perdu": "PERDU",
};

function statusForStageName(name: string): LeadStatus | undefined {
  const exact = STATUS_BY_STAGE_NAME[name];
  if (exact) return exact;
  const lower = name.trim().toLowerCase();
  for (const [k, v] of Object.entries(STATUS_BY_STAGE_NAME)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/**
 * Repli statut → étape. Un lead sans `pipelineStageId` explicite (importé,
 * seed, créé hors pipeline…) est rattaché à l'étape standard correspondant à
 * son statut, sinon il n'apparaîtrait jamais dans le Kanban / les métriques.
 * Le `pipelineStageId` explicite (drag-drop) reste toujours prioritaire.
 */
export const STAGE_NAMES_BY_STATUS: Record<LeadStatus, string[]> = {
  NOUVEAU: ["Nouveau"],
  CONTACTE: ["Contacté", "Contacte"],
  QUALIFIE: ["Qualifié", "Qualifie"],
  EN_DISCUSSION: ["En discussion", "Négociation", "Negociation"],
  CONVERTI: ["Gagné", "Gagne", "Converti"],
  PERDU: ["Perdu"],
};

export function resolveStageIdForStatus(
  status: LeadStatus,
  stages: { id: string; name: string }[],
): string | null {
  for (const name of STAGE_NAMES_BY_STATUS[status] ?? []) {
    const found = stages.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
    if (found) return found.id;
  }
  return null;
}

/** Synchronise la colonne pipeline quand le statut CRM change (fiche lead). */
export async function syncPipelineStageForStatus(
  leadId: string,
  status: LeadStatus,
  scope: DataScope,
  userId?: string | null,
): Promise<{ stageId: string | null; changed: boolean }> {
  await ensureDefaultPipelineStages(scope.userId);
  const stages = await prisma.pipelineStage.findMany({
    where: { ownerUserId: scope.userId },
    orderBy: { order: "asc" },
  });
  const stageId = resolveStageIdForStatus(status, stages);
  if (!stageId) return { stageId: null, changed: false };

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.deletedAt || lead.pipelineStageId === stageId) {
    return { stageId, changed: false };
  }

  const previousStageId = lead.pipelineStageId;
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { pipelineStageId: stageId, lastActionAt: new Date() },
    }),
    prisma.leadPipeline.upsert({
      where: { leadId },
      create: { leadId, stageId, position: 0, enteredAt: new Date() },
      update: { stageId, enteredAt: new Date() },
    }),
  ]);

  const stage = stages.find((s) => s.id === stageId);
  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: userId ?? null,
      type: "stage_change",
      payload: {
        fromStageId: previousStageId,
        toStageId: stageId,
        toStageName: stage?.name ?? null,
        source: "status_sync",
      } as object,
    },
  });

  return { stageId, changed: true };
}

function resolveEffectiveStageId(
  lead: { status: LeadStatus; pipelineStageId: string | null },
  stages: { id: string; name: string }[],
): string | null {
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
}

async function effectiveCountByStage(
  stages: { id: string; name: string }[],
  scope: DataScope,
  stageOwnerUserId: string,
): Promise<Map<string, number>> {
  const leads = await prisma.lead.findMany({
    where: buildPipelineLeadsWhere(stageOwnerUserId, scope),
    select: { status: true, pipelineStageId: true },
  });
  const countByStage = new Map<string, number>(stages.map((s) => [s.id, 0]));
  for (const l of leads) {
    const sid = resolveEffectiveStageId(l, stages);
    if (sid != null && countByStage.has(sid)) {
      countByStage.set(sid, (countByStage.get(sid) ?? 0) + 1);
    }
  }
  return countByStage;
}

// ── Stages CRUD ──────────────────────────────────────────────────────────────

export type ListStagesResult = {
  stages: PipelineStageItem[];
  readOnly: boolean;
  ownerUserId: string;
};

export async function listStages(
  scope: DataScope,
  opts?: { ownerUserId?: string | null },
): Promise<ListStagesResult> {
  const { ownerUserId, readOnly } = await resolvePipelineOwnerId(scope, opts?.ownerUserId);
  await ensureDefaultPipelineStages(ownerUserId);
  const stages = await prisma.pipelineStage.findMany({
    where: { ownerUserId },
    orderBy: { order: "asc" },
  });
  const countByStage = await effectiveCountByStage(stages, scope, ownerUserId);
  return {
    ownerUserId,
    readOnly,
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      color: s.color,
      leadCount: countByStage.get(s.id) ?? 0,
      createdAt: s.createdAt,
    })),
  };
}

export async function createStage(
  input: { name: string; color?: string | null },
  scope: DataScope,
): Promise<PipelineStageItem> {
  await ensureDefaultPipelineStages(scope.userId);
  const max = await prisma.pipelineStage.aggregate({
    where: { ownerUserId: scope.userId },
    _max: { order: true },
  });
  const order = (max._max.order ?? -1) + 1;
  const stage = await prisma.pipelineStage.create({
    data: { name: input.name, color: input.color ?? null, order, ownerUserId: scope.userId },
  });
  return { id: stage.id, name: stage.name, order: stage.order, color: stage.color, leadCount: 0, createdAt: stage.createdAt };
}

async function assertOwnStage(id: string, scope: DataScope) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id, ...strictOwnerWhere(scope.userId) },
  });
  if (!stage) throw new DataScopeError("not_found", "Étape introuvable ou accès refusé");
  return stage;
}

export async function updateStage(
  id: string,
  input: { name?: string; color?: string | null },
  scope: DataScope,
): Promise<void> {
  await assertOwnStage(id, scope);
  await prisma.pipelineStage.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export async function deleteStage(id: string, scope: DataScope, opts?: { reassignTo?: string }): Promise<void> {
  const stage = await assertOwnStage(id, scope);

  if (opts?.reassignTo) {
    const target = await prisma.pipelineStage.findFirst({
      where: { id: opts.reassignTo, ...strictOwnerWhere(scope.userId) },
    });
    if (!target) throw new DataScopeError("not_found", "Étape de réassignation introuvable");
    if (opts.reassignTo === id) throw new DataScopeError("forbidden", "Impossible de réassigner vers la même colonne");
  }

  const allStages = await prisma.pipelineStage.findMany({
    where: { ownerUserId: scope.userId },
    select: { id: true, name: true },
  });
  const leadsInPipeline = await prisma.lead.findMany({
    where: buildPipelineLeadsWhere(scope.userId, scope),
    select: { id: true, status: true, pipelineStageId: true },
  });
  const leadIdsInColumn = leadsInPipeline
    .filter((l) => resolveEffectiveStageId(l, allStages) === id)
    .map((l) => l.id);

  await prisma.$transaction(async (tx) => {
    if (opts?.reassignTo) {
      await tx.lead.updateMany({
        where: { id: { in: leadIdsInColumn } },
        data: { pipelineStageId: opts.reassignTo },
      });
      await tx.leadPipeline.updateMany({
        where: { stageId: id },
        data: { stageId: opts.reassignTo },
      });
    } else {
      await tx.lead.updateMany({
        where: { id: { in: leadIdsInColumn } },
        data: { pipelineStageId: null },
      });
      await tx.leadPipeline.deleteMany({ where: { stageId: id } });
    }
    await tx.pipelineStage.delete({ where: { id } });
  });
}

export async function reorderStages(orderedIds: string[], scope: DataScope): Promise<void> {
  for (const id of orderedIds) await assertOwnStage(id, scope);
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.pipelineStage.update({ where: { id }, data: { order: idx } }),
    ),
  );
}

// ── Move lead between stages (PL-03) ────────────────────────────────────────

export async function moveLeadToStage(args: {
  leadId: string;
  stageId: string;
  position?: number;
  scope: DataScope;
  userId?: string | null;
}): Promise<{
  leadId: string;
  stageId: string;
  status: LeadStatus;
  statusChanged: boolean;
}> {
  await assertLeadAccess(args.scope, args.leadId);

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: args.stageId, ownerUserId: args.scope.userId },
  });
  if (!stage) throw new DataScopeError("not_found", "Étape introuvable");
  const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
  if (!lead || lead.deletedAt) throw new DataScopeError("not_found", "Lead introuvable");

  const previousStageId = lead.pipelineStageId;
  const previousStatus = lead.status;

  // Inférence du nouveau status depuis le nom de l'étape (si mapping standard).
  const nextStatus = statusForStageName(stage.name);
  const statusChanged = Boolean(nextStatus && nextStatus !== previousStatus);

  const position = args.position ?? 0;

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: args.leadId },
      data: {
        pipelineStageId: args.stageId,
        ...(statusChanged ? { status: nextStatus } : {}),
        lastActionAt: new Date(),
      },
    }),
    // Upsert LeadPipeline (leadId unique)
    prisma.leadPipeline.upsert({
      where: { leadId: args.leadId },
      create: {
        leadId: args.leadId,
        stageId: args.stageId,
        position,
        enteredAt: new Date(),
      },
      update: {
        stageId: args.stageId,
        position,
        enteredAt: previousStageId === args.stageId ? undefined : new Date(),
      },
    }),
  ]);

  await prisma.leadHistory.create({
    data: {
      leadId: args.leadId,
      userId: args.userId ?? null,
      type: statusChanged ? "stage_and_status_change" : "stage_change",
      payload: {
        fromStageId: previousStageId,
        toStageId: args.stageId,
        toStageName: stage.name,
        ...(statusChanged ? { fromStatus: previousStatus, toStatus: nextStatus } : {}),
      } as object,
    },
  });

  return {
    leadId: args.leadId,
    stageId: args.stageId,
    status: statusChanged ? (nextStatus as LeadStatus) : previousStatus,
    statusChanged,
  };
}

// ── Metrics (PL-05) ──────────────────────────────────────────────────────────

export type StageMetric = {
  id: string;
  name: string;
  color: string | null;
  order: number;
  count: number;
  avgDaysInStage: number | null;
  conversionRateFromPrevious: number | null;
  totalBusinessPotentialEur: number;
  avgBusinessPotentialEur: number | null;
};

export type PipelineMetrics = {
  totalLeads: number;
  totalBusinessPotentialEur: number;
  stages: StageMetric[];
  /** Taux de conversion global : leads en "Gagné" / total. */
  winRate: number | null;
};

function decimalToNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v && typeof (v as { toNumber: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function businessPotentialByStage(
  stages: { id: string; name: string }[],
  scope: DataScope,
  stageOwnerUserId: string,
): Promise<Map<string, { total: number; count: number }>> {
  const leads = await prisma.lead.findMany({
    where: buildPipelineLeadsWhere(stageOwnerUserId, scope),
    select: { status: true, pipelineStageId: true, businessPotentialEur: true },
  });
  const map = new Map<string, { total: number; count: number }>(
    stages.map((s) => [s.id, { total: 0, count: 0 }]),
  );
  for (const l of leads) {
    const sid = resolveEffectiveStageId(l, stages);
    if (!sid || !map.has(sid)) continue;
    const bucket = map.get(sid)!;
    bucket.count += 1;
    const eur = decimalToNumber(l.businessPotentialEur);
    if (eur > 0) bucket.total += eur;
  }
  return map;
}

export async function pipelineMetrics(
  scope: DataScope,
  opts?: { ownerUserId?: string | null },
): Promise<PipelineMetrics> {
  const { ownerUserId } = await resolvePipelineOwnerId(scope, opts?.ownerUserId);
  await ensureDefaultPipelineStages(ownerUserId);
  const stages = await prisma.pipelineStage.findMany({
    where: { ownerUserId },
    orderBy: { order: "asc" },
  });

  const countByStage = await effectiveCountByStage(stages, scope, ownerUserId);
  const revenueByStage = await businessPotentialByStage(stages, scope, ownerUserId);

  // Durée moyenne dans chaque étape : moyenne de (now - LeadPipeline.enteredAt) pour les leads
  // actuellement présents dans cette étape (vue "santé du pipeline").
  const pipes = await prisma.leadPipeline.findMany({
    select: { stageId: true, enteredAt: true },
  });
  const now = Date.now();
  const durByStage = new Map<string, number[]>();
  for (const p of pipes) {
    const days = Math.max(0, (now - p.enteredAt.getTime()) / (1000 * 3600 * 24));
    const arr = durByStage.get(p.stageId) ?? [];
    arr.push(days);
    durByStage.set(p.stageId, arr);
  }
  const avgDur = (id: string): number | null => {
    const arr = durByStage.get(id);
    if (!arr || arr.length === 0) return null;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  };

  // Conversion entre étapes : pour l'étape N>0, le taux est count(N) / count(N-1).
  // C'est une approximation "instantanée" (combien sont actuellement dans l'étape
  // par rapport à la précédente). Plus simple qu'un suivi cohorté.
  const stageMetrics: StageMetric[] = stages.map((s, idx) => {
    const count = countByStage.get(s.id) ?? 0;
    let conversionRateFromPrevious: number | null = null;
    if (idx > 0) {
      const prev = stages[idx - 1];
      if (!prev) {
        conversionRateFromPrevious = null;
      } else {
        const prevCount = countByStage.get(prev.id) ?? 0;
        conversionRateFromPrevious = prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : null;
      }
    }
    const rev = revenueByStage.get(s.id) ?? { total: 0, count: 0 };
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      order: s.order,
      count,
      avgDaysInStage: avgDur(s.id),
      conversionRateFromPrevious,
      totalBusinessPotentialEur: Math.round(rev.total * 100) / 100,
      avgBusinessPotentialEur:
        rev.count > 0 ? Math.round((rev.total / rev.count) * 100) / 100 : null,
    };
  });

  const totalLeads = stageMetrics.reduce((a, b) => a + b.count, 0);
  const totalBusinessPotentialEur = stageMetrics.reduce((a, b) => a + b.totalBusinessPotentialEur, 0);
  const wonStage = stages.find((s) => s.name === "Gagné" || s.name === "Converti");
  const won = wonStage ? (countByStage.get(wonStage.id) ?? 0) : 0;
  const winRate = totalLeads > 0 ? Math.round((won / totalLeads) * 1000) / 10 : null;

  return { totalLeads, totalBusinessPotentialEur, stages: stageMetrics, winRate };
}
