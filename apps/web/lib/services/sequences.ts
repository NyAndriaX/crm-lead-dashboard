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
export async function removeLeadFromSequence(sequenceId: string, leadId: string): Promise<void> {
  await prisma.sequenceLead.updateMany({
    where: { sequenceId, leadId, status: { in: ["active", "paused"] } },
    data: { status: "stopped", stoppedReason: "manual", nextSendAt: null },
  });
}
