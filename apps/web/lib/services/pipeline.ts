/**
 * Service Pipeline — gestion des étapes commerciales (PL-02), déplacement des
 * leads entre étapes (PL-03), métriques pipeline (PL-05).
 */
import { prisma } from "@crm/db";
import type { LeadStatus } from "@crm/db";

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
  "Qualifié": "QUALIFIE",
  "Négociation": "EN_DISCUSSION",
  "En discussion": "EN_DISCUSSION",
  "Gagné": "CONVERTI",
  "Perdu": "PERDU",
};

// ── Stages CRUD ──────────────────────────────────────────────────────────────

export async function listStages(): Promise<PipelineStageItem[]> {
  const stages = await prisma.pipelineStage.findMany({
    orderBy: { order: "asc" },
  });
  // Compte les leads par étape (non supprimés) en une requête groupBy.
  const counts = await prisma.lead.groupBy({
    by: ["pipelineStageId"],
    where: { deletedAt: null, pipelineStageId: { not: null } },
    _count: { _all: true },
  });
  const countByStage = new Map<string, number>(
    counts
      .filter((c): c is typeof c & { pipelineStageId: string } => c.pipelineStageId != null)
      .map((c) => [c.pipelineStageId, c._count._all]),
  );
  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    color: s.color,
    leadCount: countByStage.get(s.id) ?? 0,
    createdAt: s.createdAt,
  }));
}

export async function createStage(input: { name: string; color?: string | null }): Promise<PipelineStageItem> {
  // Place en fin de liste par défaut.
  const max = await prisma.pipelineStage.aggregate({ _max: { order: true } });
  const order = (max._max.order ?? -1) + 1;
  const stage = await prisma.pipelineStage.create({
    data: { name: input.name, color: input.color ?? null, order },
  });
  return { id: stage.id, name: stage.name, order: stage.order, color: stage.color, leadCount: 0, createdAt: stage.createdAt };
}

export async function updateStage(
  id: string,
  input: { name?: string; color?: string | null },
): Promise<void> {
  await prisma.pipelineStage.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export async function deleteStage(id: string, opts?: { reassignTo?: string }): Promise<void> {
  // Si on supprime une étape contenant des leads, on les réassigne ou on
  // détache (pipelineStageId = null).
  if (opts?.reassignTo) {
    await prisma.lead.updateMany({
      where: { pipelineStageId: id },
      data: { pipelineStageId: opts.reassignTo },
    });
    await prisma.leadPipeline.updateMany({
      where: { stageId: id },
      data: { stageId: opts.reassignTo },
    });
  } else {
    await prisma.lead.updateMany({
      where: { pipelineStageId: id },
      data: { pipelineStageId: null },
    });
    await prisma.leadPipeline.deleteMany({ where: { stageId: id } });
  }
  await prisma.pipelineStage.delete({ where: { id } });
}

export async function reorderStages(orderedIds: string[]): Promise<void> {
  // Réécriture explicite de l'ordre. Atomique via transaction.
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
  userId?: string | null;
}): Promise<{
  leadId: string;
  stageId: string;
  status: LeadStatus;
  statusChanged: boolean;
}> {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: args.stageId } });
  if (!stage) throw new Error("Étape introuvable");
  const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
  if (!lead || lead.deletedAt) throw new Error("Lead introuvable");

  const previousStageId = lead.pipelineStageId;
  const previousStatus = lead.status;

  // Inférence du nouveau status depuis le nom de l'étape (si mapping standard).
  const nextStatus = STATUS_BY_STAGE_NAME[stage.name];
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
};

export type PipelineMetrics = {
  totalLeads: number;
  stages: StageMetric[];
  /** Taux de conversion global : leads en "Gagné" / total. */
  winRate: number | null;
};

export async function pipelineMetrics(): Promise<PipelineMetrics> {
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: "asc" } });

  // Count par stage (leads non supprimés).
  const counts = await prisma.lead.groupBy({
    by: ["pipelineStageId"],
    where: { deletedAt: null, pipelineStageId: { not: null } },
    _count: { _all: true },
  });
  const countByStage = new Map<string, number>(
    counts
      .filter((c): c is typeof c & { pipelineStageId: string } => c.pipelineStageId != null)
      .map((c) => [c.pipelineStageId, c._count._all]),
  );

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
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      order: s.order,
      count,
      avgDaysInStage: avgDur(s.id),
      conversionRateFromPrevious,
    };
  });

  const totalLeads = stageMetrics.reduce((a, b) => a + b.count, 0);
  const wonStage = stages.find((s) => s.name === "Gagné" || s.name === "Converti");
  const won = wonStage ? (countByStage.get(wonStage.id) ?? 0) : 0;
  const winRate = totalLeads > 0 ? Math.round((won / totalLeads) * 1000) / 10 : null;

  return { totalLeads, stages: stageMetrics, winRate };
}
