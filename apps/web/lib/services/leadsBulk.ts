/**
 * Service Bulk Leads — opérations groupées sur une sélection de leads.
 *
 * Toutes les opérations sont idempotentes et tolérantes (un ID introuvable
 * est silencieusement ignoré, on retourne `succeeded` + `failed` détaillés).
 */
import { asStringArray, prisma } from "@crm/db";
import { syncTags } from "@/lib/services/leads";

const MAX_IDS = 1000;

export type BulkResult = {
  requested: number;
  succeeded: number;
  failed: number;
  errors: { id: string; error: string }[];
};

function clampIds(ids: string[]): string[] {
  return Array.from(new Set(ids)).slice(0, MAX_IDS);
}

export async function bulkSoftDelete(ids: string[]): Promise<BulkResult> {
  const list = clampIds(ids);
  const now = new Date();
  const r = await prisma.lead.updateMany({
    where: { id: { in: list }, deletedAt: null },
    data: { deletedAt: now, updatedAt: now },
  });
  return { requested: list.length, succeeded: r.count, failed: list.length - r.count, errors: [] };
}

export async function bulkRestore(ids: string[]): Promise<BulkResult> {
  const list = clampIds(ids);
  const r = await prisma.lead.updateMany({
    where: { id: { in: list }, deletedAt: { not: null } },
    data: { deletedAt: null, updatedAt: new Date() },
  });
  return { requested: list.length, succeeded: r.count, failed: list.length - r.count, errors: [] };
}

export async function bulkAssign(ids: string[], assignedToId: string | null): Promise<BulkResult> {
  const list = clampIds(ids);
  if (assignedToId) {
    const user = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return {
        requested: list.length, succeeded: 0, failed: list.length,
        errors: [{ id: "*", error: "Utilisateur inactif ou introuvable" }],
      };
    }
  }
  const r = await prisma.lead.updateMany({
    where: { id: { in: list }, deletedAt: null },
    data: { assignedToId, lastActionAt: new Date() },
  });
  // History entry per lead
  await prisma.leadHistory.createMany({
    data: list.map((leadId) => ({
      leadId,
      type: assignedToId ? "assigned" : "unassigned",
      payload: { bulk: true, to: assignedToId } as object,
    })),
  });
  return { requested: list.length, succeeded: r.count, failed: list.length - r.count, errors: [] };
}

export async function bulkSetStatus(
  ids: string[],
  status: "NOUVEAU" | "CONTACTE" | "QUALIFIE" | "EN_DISCUSSION" | "CONVERTI" | "PERDU",
): Promise<BulkResult> {
  const list = clampIds(ids);
  const r = await prisma.lead.updateMany({
    where: { id: { in: list }, deletedAt: null },
    data: { status, lastActionAt: new Date() },
  });
  await prisma.leadHistory.createMany({
    data: list.map((leadId) => ({
      leadId,
      type: "status_change",
      payload: { bulk: true, to: status } as object,
    })),
  });
  return { requested: list.length, succeeded: r.count, failed: list.length - r.count, errors: [] };
}

/** Ajoute des tags sans supprimer les existants (set union). */
export async function bulkAddTags(ids: string[], tags: string[]): Promise<BulkResult> {
  const list = clampIds(ids);
  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  if (cleaned.length === 0) {
    return { requested: list.length, succeeded: 0, failed: 0, errors: [] };
  }
  await syncTags(cleaned);
  const leads = await prisma.lead.findMany({
    where: { id: { in: list }, deletedAt: null },
    select: { id: true, tags: true },
  });
  let succeeded = 0;
  for (const lead of leads) {
    const next = Array.from(new Set([...asStringArray(lead.tags), ...cleaned]));
    if (next.length === asStringArray(lead.tags).length) {
      succeeded++;
      continue;
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { tags: next, lastActionAt: new Date() },
    });
    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        type: "tags_set",
        payload: { bulk: true, added: cleaned, tags: next } as object,
      },
    });
    succeeded++;
  }
  return { requested: list.length, succeeded, failed: list.length - leads.length, errors: [] };
}

/** Retire des tags spécifiques (différence ensembliste). */
export async function bulkRemoveTags(ids: string[], tags: string[]): Promise<BulkResult> {
  const list = clampIds(ids);
  const toRemove = new Set(tags.map((t) => t.trim()).filter(Boolean));
  if (toRemove.size === 0) {
    return { requested: list.length, succeeded: 0, failed: 0, errors: [] };
  }
  const leads = await prisma.lead.findMany({
    where: { id: { in: list }, deletedAt: null },
    select: { id: true, tags: true },
  });
  let succeeded = 0;
  for (const lead of leads) {
    const next = asStringArray(lead.tags).filter((t) => !toRemove.has(t));
    if (next.length === asStringArray(lead.tags).length) {
      succeeded++;
      continue;
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { tags: next, lastActionAt: new Date() },
    });
    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        type: "tags_set",
        payload: { bulk: true, removed: [...toRemove], tags: next } as object,
      },
    });
    succeeded++;
  }
  return { requested: list.length, succeeded, failed: list.length - leads.length, errors: [] };
}

export async function bulkEnrollInSequence(
  ids: string[],
  sequenceId: string,
): Promise<BulkResult> {
  const list = clampIds(ids);
  const sequence = await prisma.sequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) {
    return {
      requested: list.length, succeeded: 0, failed: list.length,
      errors: [{ id: "*", error: "Séquence introuvable" }],
    };
  }
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const firstDelay = steps.length > 0 && typeof (steps[0] as { delayDays?: number })?.delayDays === "number"
    ? (steps[0] as { delayDays: number }).delayDays
    : 0;
  const nextSendAt = new Date(Date.now() + Math.max(0, firstDelay) * 24 * 3600 * 1000);

  // On enrôle uniquement les leads qui ne sont pas déjà dans cette séquence.
  const existing = await prisma.sequenceLead.findMany({
    where: { sequenceId, leadId: { in: list } },
    select: { leadId: true },
  });
  const existingSet = new Set(existing.map((e) => e.leadId));
  const toEnroll = list.filter((id) => !existingSet.has(id));

  if (toEnroll.length === 0) {
    return { requested: list.length, succeeded: 0, failed: 0, errors: [] };
  }

  await prisma.sequenceLead.createMany({
    data: toEnroll.map((leadId) => ({
      sequenceId,
      leadId,
      currentStep: 0,
      sentCount: 0,
      status: "active",
      nextSendAt,
    })),
  });
  return { requested: list.length, succeeded: toEnroll.length, failed: 0, errors: [] };
}
