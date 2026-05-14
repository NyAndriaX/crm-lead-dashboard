/**
 * Service Séquences de relance (RL-01 / RL-02 / RL-04 / RL-06 / RL-07).
 */
import { prisma } from "@crm/db";

export type SequenceStepInput = {
  delayDays: number;
  templateId?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  stopOnReply?: boolean;
};

export type SequenceInput = {
  name: string;
  steps: SequenceStepInput[];
  maxSteps?: number | null;
  isPaused?: boolean;
};

export type SequenceUpdateInput = Partial<SequenceInput>;

function normalizeSteps(steps: SequenceStepInput[]): SequenceStepInput[] {
  return steps.map((s) => ({
    delayDays: Math.max(0, Math.floor(Number(s.delayDays ?? 0))),
    templateId: s.templateId ?? null,
    subject: s.subject?.trim() || null,
    bodyHtml: s.bodyHtml ?? null,
    stopOnReply: s.stopOnReply !== false,
  }));
}

export async function listSequences() {
  const rows = await prisma.sequence.findMany({ orderBy: { createdAt: "desc" } });
  const counts = await prisma.sequenceLead.groupBy({
    by: ["sequenceId", "status"],
    _count: { _all: true },
  });
  const countMap = new Map<string, Record<string, number>>();
  for (const c of counts) {
    const cur = countMap.get(c.sequenceId) ?? {};
    cur[c.status] = c._count._all;
    countMap.set(c.sequenceId, cur);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    steps: r.steps as unknown,
    maxSteps: r.maxSteps,
    isPaused: r.isPaused,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    stats: countMap.get(r.id) ?? {},
  }));
}

export async function getSequence(id: string) {
  const row = await prisma.sequence.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    steps: row.steps as unknown,
    maxSteps: row.maxSteps,
    isPaused: row.isPaused,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createSequence(input: SequenceInput) {
  return prisma.sequence.create({
    data: {
      name: input.name.trim(),
      steps: normalizeSteps(input.steps) as object,
      maxSteps: input.maxSteps ?? null,
      isPaused: input.isPaused ?? false,
    },
  });
}

export async function updateSequence(id: string, input: SequenceUpdateInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.steps !== undefined) data.steps = normalizeSteps(input.steps) as object;
  if (input.maxSteps !== undefined) data.maxSteps = input.maxSteps;
  if (input.isPaused !== undefined) data.isPaused = input.isPaused;
  return prisma.sequence.update({ where: { id }, data });
}

export async function deleteSequence(id: string) {
  // Cascade applicative : on retire d'abord les SequenceLead liés.
  await prisma.sequenceLead.deleteMany({ where: { sequenceId: id } });
  await prisma.sequence.delete({ where: { id } });
}

export async function setSequencePaused(id: string, paused: boolean) {
  return prisma.sequence.update({ where: { id }, data: { isPaused: paused } });
}

/** Liste les leads inscrits dans une séquence (avec leur statut courant). */
export async function listSequenceLeads(sequenceId: string) {
  return prisma.sequenceLead.findMany({
    where: { sequenceId },
    orderBy: { createdAt: "desc" },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          company: true,
          status: true,
          emailStatus: true,
          lastReplyAt: true,
        },
      },
    },
  });
}

/**
 * Ajoute une liste de leads à une séquence (idempotent : skip ceux déjà inscrits actifs).
 * Calcule nextSendAt = now + steps[0].delayDays (premier step démarre tout de suite si delay=0).
 */
export async function enrollLeadsInSequence(
  sequenceId: string,
  leadIds: string[],
): Promise<{ enrolled: number; skipped: number }> {
  if (leadIds.length === 0) return { enrolled: 0, skipped: 0 };
  const seq = await prisma.sequence.findUnique({ where: { id: sequenceId } });
  if (!seq) throw new Error("Sequence introuvable");
  const steps = Array.isArray(seq.steps) ? (seq.steps as Array<{ delayDays?: number }>) : [];
  const firstDelayMs = Math.max(0, Math.floor(Number(steps[0]?.delayDays ?? 0))) * 24 * 3600 * 1000;
  const nextSendAt = new Date(Date.now() + firstDelayMs);

  const existing = await prisma.sequenceLead.findMany({
    where: { sequenceId, leadId: { in: leadIds }, status: { in: ["active", "paused"] } },
    select: { leadId: true },
  });
  const existingSet = new Set(existing.map((e) => e.leadId));
  const toCreate = leadIds.filter((id) => !existingSet.has(id));
  if (toCreate.length === 0) return { enrolled: 0, skipped: leadIds.length };

  await prisma.sequenceLead.createMany({
    data: toCreate.map((leadId) => ({
      sequenceId,
      leadId,
      currentStep: 0,
      nextSendAt,
      status: "active",
    })),
  });
  return { enrolled: toCreate.length, skipped: leadIds.length - toCreate.length };
}

/** Retire un lead d'une séquence (RL-07). */
// ── Dashboard global (RL-05) ────────────────────────────────────────────────

export type SequencesDashboard = {
  totals: {
    sequences: number;
    sequencesActive: number;
    sequencesPaused: number;
    leadsTotal: number;
    leadsActive: number;
    leadsCompleted: number;
    leadsStopped: number;
    emailsSentFromSequences: number;
    repliesStopped: number;
  };
  bySequence: {
    id: string;
    name: string;
    isPaused: boolean;
    maxSteps: number | null;
    active: number;
    completed: number;
    stopped: number;
    avgCurrentStep: number | null;
    totalSent: number;
    stoppedReasons: Record<string, number>;
    nextScheduledAt: Date | null;
  }[];
};

export async function getSequencesDashboard(): Promise<SequencesDashboard> {
  const sequences = await prisma.sequence.findMany({ orderBy: { createdAt: "desc" } });
  if (sequences.length === 0) {
    return {
      totals: {
        sequences: 0, sequencesActive: 0, sequencesPaused: 0,
        leadsTotal: 0, leadsActive: 0, leadsCompleted: 0, leadsStopped: 0,
        emailsSentFromSequences: 0, repliesStopped: 0,
      },
      bySequence: [],
    };
  }
  const seqIds = sequences.map((s) => s.id);

  const sequenceLeads = await prisma.sequenceLead.findMany({
    where: { sequenceId: { in: seqIds } },
    select: { sequenceId: true, status: true, currentStep: true, sentCount: true, stoppedReason: true, nextSendAt: true },
  });

  // Agrégation par séquence
  type Acc = {
    active: number; completed: number; stopped: number; paused: number;
    sumStep: number; nStep: number;
    totalSent: number;
    reasons: Map<string, number>;
    nextScheduledAt: Date | null;
  };
  const byId = new Map<string, Acc>();
  for (const s of seqIds) {
    byId.set(s, {
      active: 0, completed: 0, stopped: 0, paused: 0,
      sumStep: 0, nStep: 0,
      totalSent: 0,
      reasons: new Map(),
      nextScheduledAt: null,
    });
  }
  for (const sl of sequenceLeads) {
    const acc = byId.get(sl.sequenceId);
    if (!acc) continue;
    if (sl.status === "active") {
      acc.active++;
      acc.sumStep += sl.currentStep;
      acc.nStep++;
      if (sl.nextSendAt && (!acc.nextScheduledAt || sl.nextSendAt < acc.nextScheduledAt)) {
        acc.nextScheduledAt = sl.nextSendAt;
      }
    } else if (sl.status === "completed") {
      acc.completed++;
    } else if (sl.status === "stopped") {
      acc.stopped++;
      if (sl.stoppedReason) {
        acc.reasons.set(sl.stoppedReason, (acc.reasons.get(sl.stoppedReason) ?? 0) + 1);
      }
    } else if (sl.status === "paused") {
      acc.paused++;
    }
    acc.totalSent += sl.sentCount;
  }

  // Nb d'emails issus de séquences (events SENT avec sequenceId)
  const sentEvents = await prisma.emailEvent.count({
    where: { eventType: "SENT", sequenceId: { in: seqIds } },
  });

  const bySequence = sequences.map((s) => {
    const acc = byId.get(s.id) ?? {
      active: 0, completed: 0, stopped: 0, paused: 0,
      sumStep: 0, nStep: 0, totalSent: 0, reasons: new Map<string, number>(), nextScheduledAt: null as Date | null,
    };
    return {
      id: s.id,
      name: s.name,
      isPaused: s.isPaused,
      maxSteps: s.maxSteps,
      active: acc.active,
      completed: acc.completed,
      stopped: acc.stopped,
      avgCurrentStep: acc.nStep > 0 ? Math.round((acc.sumStep / acc.nStep) * 10) / 10 : null,
      totalSent: acc.totalSent,
      stoppedReasons: Object.fromEntries(acc.reasons),
      nextScheduledAt: acc.nextScheduledAt,
    };
  });

  const leadsTotal = sequenceLeads.length;
  const leadsActive = sequenceLeads.filter((l) => l.status === "active").length;
  const leadsCompleted = sequenceLeads.filter((l) => l.status === "completed").length;
  const leadsStopped = sequenceLeads.filter((l) => l.status === "stopped").length;
  const repliesStopped = sequenceLeads.filter((l) => l.status === "stopped" && l.stoppedReason === "reply").length;

  return {
    totals: {
      sequences: sequences.length,
      sequencesActive: sequences.filter((s) => !s.isPaused).length,
      sequencesPaused: sequences.filter((s) => s.isPaused).length,
      leadsTotal,
      leadsActive,
      leadsCompleted,
      leadsStopped,
      emailsSentFromSequences: sentEvents,
      repliesStopped,
    },
    bySequence,
  };
}

export async function removeLeadFromSequence(sequenceId: string, leadId: string): Promise<void> {
  await prisma.sequenceLead.updateMany({
    where: { sequenceId, leadId, status: { in: ["active", "paused"] } },
    data: { status: "stopped", stoppedReason: "manual", nextSendAt: null },
  });
}
