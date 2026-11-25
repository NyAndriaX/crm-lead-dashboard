/**
 * Cohérence statut du lead ↔ colonne du pipeline (Kanban).
 *
 * Le statut est la référence : à chaque changement de statut (réponse reçue, changement manuel ou groupé),
 * la carte rejoint la colonne correspondante. Exception : si la carte est déjà dans une colonne du même
 * statut (ex. « Proposition » ou « Négociation » pour EN_DISCUSSION), elle n'est pas déplacée.
 * Dans l'autre sens, glisser une carte change le statut (STATUS_BY_STAGE_NAME).
 */
import type { LeadStatus, PrismaClient } from "@prisma/client";

/** Colonne cible d'un statut, par ordre de préférence (noms des étapes standard). */
export const STAGE_NAMES_BY_STATUS: Record<LeadStatus, string[]> = {
  NOUVEAU: ["Nouveau"],
  CONTACTE: ["Contacté"],
  QUALIFIE: ["Qualifié"],
  EN_DISCUSSION: ["En discussion", "Négociation"],
  CONVERTI: ["Gagné", "Converti"],
  PERDU: ["Perdu"],
};

/** Statut correspondant à une colonne standard (glisser-déposer). */
export const STATUS_BY_STAGE_NAME: Record<string, LeadStatus> = {
  "Nouveau": "NOUVEAU",
  "Contacté": "CONTACTE",
  "Qualifié": "QUALIFIE",
  "En discussion": "EN_DISCUSSION",
  "Proposition": "EN_DISCUSSION",
  "Négociation": "EN_DISCUSSION",
  "Gagné": "CONVERTI",
  "Converti": "CONVERTI",
  "Perdu": "PERDU",
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

export function statusForStageName(name: string): LeadStatus | null {
  const n = norm(name);
  const hit = Object.entries(STATUS_BY_STAGE_NAME).find(([k]) => norm(k) === n);
  return hit ? hit[1] : null;
}

export function stageForStatus<T extends { id: string; name: string }>(status: LeadStatus, stages: T[]): T | null {
  for (const name of STAGE_NAMES_BY_STATUS[status] ?? []) {
    const found = stages.find((s) => norm(s.name) === norm(name));
    if (found) return found;
  }
  return null;
}

type Db = Pick<PrismaClient, "lead" | "pipelineStage" | "leadPipeline">;

/** Place la carte du lead dans la colonne de son statut (voir règles en tête de fichier). Renvoie l'étape ou null. */
export async function syncPipelineStageForStatus(db: Db, leadId: string, status: LeadStatus): Promise<string | null> {
  const [lead, stages] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { pipelineStageId: true } }),
    db.pipelineStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!lead) return null;
  const current = stages.find((s) => s.id === lead.pipelineStageId);
  if (current && statusForStageName(current.name) === status) return current.id;
  const target = stageForStatus(status, stages);
  if (!target || target.id === lead.pipelineStageId) return target?.id ?? null;
  await db.lead.update({ where: { id: leadId }, data: { pipelineStageId: target.id } });
  await db.leadPipeline.upsert({
    where: { leadId },
    create: { leadId, stageId: target.id, position: 0, enteredAt: new Date() },
    update: { stageId: target.id, position: 0, enteredAt: new Date() },
  });
  return target.id;
}
