/**
 * Service Leads — CRM-009 (CRUD + listing) étendu L2 :
 *  - filtres avancés multi-critères (CRM-012), recherche multi-champs insensible à la casse (CRM-013),
 *  - workflow de statuts avec transitions validées (CRM-014),
 *  - tags (CRM-015), assignation + notification (CRM-016),
 *  - lead scoring recalculé sur les mutations (CRM-019),
 *  - chiffrement AES-256-GCM de l'email/téléphone (PII) + emailHash (recherche/unicité),
 *  - soft delete + restore, écriture d'historique (leadHistory) — CRM-020.
 *
 * Note CRM-013 : recherche implémentée en multi-champs `contains` insensible à la casse
 * (substring) + debounce 300 ms côté client. Le text index Mongo (`@@fulltext`) reste
 * disponible pour un `findRaw({ $text })` ranké si besoin ultérieur.
 */
import { Prisma, prisma, type Lead } from "@crm/db";
import { decryptOrNull, emailHash, encryptOrNull, normalizeEmail } from "../crypto";
import type {
  AssignLeadInput, ChangeStatusInput, CreateLeadInput, LeadFilters, ListLeadsQuery,
  SetTagsInput, UpdateLeadInput,
} from "../schemas/lead";
import { parseSort } from "../schemas/common";
import { ApiError } from "../api";
import { canTransition, STOPS_SEQUENCES } from "../leadStatus";
import { computeScore } from "../scoring";
import { enqueue } from "../jobs";

const SORTABLE = ["createdAt", "updatedAt", "score", "lastActionAt", "company"];

/** Représentation "API" d'un lead : PII déchiffrée, pas de champs `*Enc`. */
export interface LeadDTO {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  country: string | null;
  source: string | null;
  status: Lead["status"];
  emailStatus: Lead["emailStatus"];
  score: number;
  tags: string[];
  notes: string | null;
  assignedToId: string | null;
  pipelineStageId: string | null;
  lastActionAt: Date | null;
  lastReplyAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDTO(l: Lead): LeadDTO {
  return {
    id: l.id,
    email: decryptOrNull(l.emailEnc),
    phone: decryptOrNull(l.phoneEnc),
    firstName: l.firstName,
    lastName: l.lastName,
    company: l.company,
    website: l.website,
    sector: l.sector,
    city: l.city,
    country: l.country,
    source: l.source,
    status: l.status,
    emailStatus: l.emailStatus,
    score: l.score,
    tags: l.tags,
    notes: l.notes,
    assignedToId: l.assignedToId,
    pipelineStageId: l.pipelineStageId,
    lastActionAt: l.lastActionAt,
    lastReplyAt: l.lastReplyAt,
    deletedAt: l.deletedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

export function buildWhere(f: Partial<LeadFilters>): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (!f.includeDeleted) where.deletedAt = null;
  if (f.status) where.status = f.status;
  if (f.source) where.source = f.source;
  if (f.sector) where.sector = f.sector;
  if (f.city) where.city = f.city;
  if (f.country) where.country = f.country;
  if (f.assignedToId) where.assignedToId = f.assignedToId;
  if (f.tag) where.tags = { has: f.tag };
  if (f.scoreMin != null || f.scoreMax != null) {
    where.score = { ...(f.scoreMin != null ? { gte: f.scoreMin } : {}), ...(f.scoreMax != null ? { lte: f.scoreMax } : {}) };
  }
  if (f.createdAfter || f.createdBefore) {
    where.createdAt = { ...(f.createdAfter ? { gte: f.createdAfter } : {}), ...(f.createdBefore ? { lte: f.createdBefore } : {}) };
  }
  if (f.q) {
    where.OR = [
      { firstName: { contains: f.q, mode: "insensitive" } },
      { lastName: { contains: f.q, mode: "insensitive" } },
      { company: { contains: f.q, mode: "insensitive" } },
      { notes: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listLeads(q: ListLeadsQuery) {
  const where = buildWhere(q);
  const orderBy = parseSort(q.sort, SORTABLE, { createdAt: "desc" }) as Prisma.LeadOrderByWithRelationInput;
  const [total, rows] = await prisma.$transaction([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return {
    data: rows.map(toDTO),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
  };
}

export async function getLead(id: string): Promise<LeadDTO> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "Lead introuvable", "not_found");
  return toDTO(lead);
}

export interface LeadHistoryEntry {
  id: string;
  type: string;
  userId: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

/** Fiche détaillée (CRM-011) : lead + historique chronologique. */
export async function getLeadDetail(id: string): Promise<{ lead: LeadDTO; history: LeadHistoryEntry[] }> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "Lead introuvable", "not_found");
  const history = await prisma.leadHistory.findMany({
    where: { leadId: id }, orderBy: { createdAt: "desc" }, take: 200,
  });
  return {
    lead: toDTO(lead),
    history: history.map((h) => ({ id: h.id, type: h.type, userId: h.userId, payload: h.payload, createdAt: h.createdAt })),
  };
}

// --- scoring (CRM-019) ---
async function scoringSignals(leadId: string) {
  const events = await prisma.emailEvent.groupBy({
    by: ["eventType"], where: { leadId }, _count: { _all: true },
  });
  const count = (t: string) => events.find((e) => String(e.eventType) === t)?._count._all ?? 0;
  return { opens: count("OPEN"), clicks: count("CLICK"), hasReplied: count("REPLIED") > 0 };
}

/** Recalcule et persiste le score d'un lead. */
export async function recalcScore(leadId: string): Promise<number> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new ApiError(404, "Lead introuvable", "not_found");
  const score = computeScore(lead, await scoringSignals(leadId));
  if (score !== lead.score) await prisma.lead.update({ where: { id: leadId }, data: { score } });
  return score;
}

async function assertEmailNotTaken(email: string, exceptId?: string) {
  const hash = emailHash(email);
  const existing = await prisma.lead.findFirst({
    where: { emailHash: hash, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Un lead avec cet email existe déjà", "duplicate_email");
}

export async function createLead(input: CreateLeadInput, actorId?: string): Promise<LeadDTO> {
  if (input.email) await assertEmailNotTaken(input.email);
  let lead = await prisma.lead.create({
    data: {
      emailEnc: encryptOrNull(input.email ?? null),
      emailHash: input.email ? emailHash(input.email) : null,
      phoneEnc: encryptOrNull(input.phone ?? null),
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      company: input.company ?? null,
      website: input.website ?? null,
      sector: input.sector ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      source: input.source ?? null,
      status: input.status ?? "NOUVEAU",
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      assignedToId: input.assignedToId ?? null,
      lastActionAt: new Date(),
    },
  });
  const score = computeScore(lead);
  if (score !== lead.score) lead = await prisma.lead.update({ where: { id: lead.id }, data: { score } });
  await prisma.leadHistory.create({ data: { leadId: lead.id, userId: actorId, type: "created", payload: { source: input.source ?? null } } });
  if (input.tags?.length) await syncTags(input.tags);
  return toDTO(lead);
}

export async function updateLead(id: string, input: UpdateLeadInput, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
  if (input.email !== undefined && input.email) await assertEmailNotTaken(input.email, id);

  // Un changement de statut doit passer par changeStatus() (transitions validées).
  if (input.status !== undefined && input.status !== current.status) {
    throw new ApiError(400, "Utilisez POST /api/leads/:id/status pour changer de statut", "use_status_endpoint");
  }

  const data: Prisma.LeadUpdateInput = {};
  if (input.email !== undefined) { data.emailEnc = encryptOrNull(input.email); data.emailHash = input.email ? emailHash(input.email) : null; }
  if (input.phone !== undefined) data.phoneEnc = encryptOrNull(input.phone);
  for (const k of ["firstName", "lastName", "company", "website", "sector", "city", "country", "source", "notes"] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
  data.lastActionAt = new Date();

  let lead = await prisma.lead.update({ where: { id }, data });
  const score = computeScore(lead, await scoringSignals(id));
  if (score !== lead.score) lead = await prisma.lead.update({ where: { id }, data: { score } });
  await prisma.leadHistory.create({ data: { leadId: id, userId: actorId, type: "updated", payload: { fields: Object.keys(data) } } });
  if (input.tags?.length) await syncTags(input.tags);
  return toDTO(lead);
}

/** Changement de statut avec validation des transitions (CRM-014). */
export async function changeStatus(id: string, input: ChangeStatusInput, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
  if (!canTransition(current.status, input.status)) {
    throw new ApiError(409, `Transition non autorisée : ${current.status} → ${input.status}`, "invalid_transition");
  }
  if (input.status === current.status) return toDTO(current);

  let lead = await prisma.lead.update({
    where: { id },
    data: {
      status: input.status,
      lastActionAt: new Date(),
      ...(input.status === "EN_DISCUSSION" ? { lastReplyAt: new Date() } : {}),
    },
  });
  const score = computeScore(lead, await scoringSignals(id));
  if (score !== lead.score) lead = await prisma.lead.update({ where: { id }, data: { score } });
  await prisma.leadHistory.create({
    data: { leadId: id, userId: actorId, type: "status_change", payload: { from: current.status, to: input.status, reason: input.reason ?? null } },
  });
  // Entrée dans un statut qui stoppe les relances → on planifie l'arrêt des séquences (CRM-041/047).
  if (STOPS_SEQUENCES.includes(input.status)) await enqueue("sequences-stop", { leadId: id, reason: `status:${input.status}` });
  return toDTO(lead);
}

/** Assignation à un commercial + notification (CRM-016). `assignedToId = null` pour désassigner. */
export async function assignLead(id: string, input: AssignLeadInput, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
  if (input.assignedToId) {
    const u = await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { id: true, isActive: true } });
    if (!u || !u.isActive) throw new ApiError(400, "Utilisateur cible invalide", "invalid_assignee");
  }
  const lead = await prisma.lead.update({ where: { id }, data: { assignedToId: input.assignedToId, lastActionAt: new Date() } });
  await prisma.leadHistory.create({
    data: { leadId: id, userId: actorId, type: input.assignedToId ? "assigned" : "unassigned", payload: { from: current.assignedToId, to: input.assignedToId } },
  });
  if (input.assignedToId && input.assignedToId !== actorId) {
    const name = [current.firstName, current.lastName].filter(Boolean).join(" ") || current.company || "un lead";
    await prisma.notification.create({
      data: { userId: input.assignedToId, type: "lead_assigned", title: "Nouveau lead assigné", body: `${name} vous a été assigné`, link: `/leads/${id}` },
    });
    await enqueue("notification", { userId: input.assignedToId, kind: "lead_assigned", leadId: id });
  }
  return toDTO(lead);
}

/** Remplace l'ensemble des tags d'un lead (CRM-015). */
export async function setLeadTags(id: string, input: SetTagsInput, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id }, select: { id: true, deletedAt: true, tags: true } });
  if (!current || current.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
  const tags = Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean)));
  const lead = await prisma.lead.update({ where: { id }, data: { tags, lastActionAt: new Date() } });
  await prisma.leadHistory.create({ data: { leadId: id, userId: actorId, type: "tags_set", payload: { from: current.tags, to: tags } } });
  await syncTags(tags);
  return toDTO(lead);
}

/** Crée à la volée les tags absents de la collection `tags` (référentiel). */
export async function syncTags(names: string[]): Promise<void> {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (wanted.length === 0) return;
  const existing = await prisma.tag.findMany({ where: { name: { in: wanted } }, select: { name: true } });
  const have = new Set(existing.map((t) => t.name));
  const missing = wanted.filter((n) => !have.has(n));
  for (const name of missing) {
    try { await prisma.tag.create({ data: { name } }); } catch { /* course concurrente : unique violation ignorée */ }
  }
}

export async function softDeleteLead(id: string, actorId?: string): Promise<void> {
  const current = await prisma.lead.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!current) throw new ApiError(404, "Lead introuvable", "not_found");
  if (current.deletedAt) return;
  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.leadHistory.create({ data: { leadId: id, userId: actorId, type: "soft_deleted" } });
}

export async function restoreLead(id: string, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id } });
  if (!current) throw new ApiError(404, "Lead introuvable", "not_found");
  const lead = await prisma.lead.update({ where: { id }, data: { deletedAt: null } });
  await prisma.leadHistory.create({ data: { leadId: id, userId: actorId, type: "restored" } });
  return toDTO(lead);
}

// --- export (CRM-018) ---
export const EXPORT_COLUMNS = [
  "id", "firstName", "lastName", "email", "phone", "company", "website",
  "sector", "city", "country", "source", "status", "score", "tags",
  "assignedToId", "createdAt", "lastActionAt",
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

export async function collectLeadsForExport(filters: Partial<LeadFilters>, columns: ExportColumn[], limit = 50_000) {
  const where = buildWhere(filters);
  const rows = await prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((l) => {
    const dto = toDTO(l);
    const rec: Record<string, unknown> = {};
    for (const c of columns) {
      const v = (dto as Record<string, unknown>)[c];
      rec[c] = Array.isArray(v) ? (v as string[]).join("; ") : v instanceof Date ? v.toISOString() : (v ?? "");
    }
    return rec;
  });
}

export { normalizeEmail };
