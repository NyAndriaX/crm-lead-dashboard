/**
 * Service Leads — CRM-009 (CRUD + listing paginé), avec :
 *  - chiffrement AES-256-GCM de l'email/téléphone (PII) + emailHash pour la recherche/unicité,
 *  - soft delete + restore,
 *  - écriture d'historique (leadHistory) sur les mutations.
 *
 * Recherche full-text ($text) : voir CRM-013 — pour l'instant on retombe sur un
 * filtre "contains" si Prisma ne peut pas utiliser le text index dans ce contexte.
 */
import { Prisma, prisma, type Lead } from "@crm/db";
import { decryptOrNull, emailHash, encryptOrNull, normalizeEmail } from "../crypto";
import type { CreateLeadInput, ListLeadsQuery, UpdateLeadInput } from "../schemas/lead";
import { parseSort } from "../schemas/common";
import { ApiError } from "../api";

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

function buildWhere(q: ListLeadsQuery): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (!q.includeDeleted) where.deletedAt = null;
  if (q.status) where.status = q.status;
  if (q.source) where.source = q.source;
  if (q.sector) where.sector = q.sector;
  if (q.assignedToId) where.assignedToId = q.assignedToId;
  if (q.tag) where.tags = { has: q.tag };
  if (q.q) {
    // Recherche : on tente le contains multi-champs (le vrai $text index est branché en CRM-013).
    where.OR = [
      { firstName: { contains: q.q, mode: "insensitive" } },
      { lastName: { contains: q.q, mode: "insensitive" } },
      { company: { contains: q.q, mode: "insensitive" } },
      { notes: { contains: q.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listLeads(q: ListLeadsQuery) {
  const where = buildWhere(q);
  const orderBy = parseSort(q.sort, SORTABLE, { createdAt: "desc" }) as Prisma.LeadOrderByWithRelationInput;
  const [total, rows] = await prisma.$transaction([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
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
  const lead = await prisma.lead.create({
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
  await prisma.leadHistory.create({
    data: { leadId: lead.id, userId: actorId, type: "created", payload: { source: input.source ?? null } },
  });
  return toDTO(lead);
}

export async function updateLead(id: string, input: UpdateLeadInput, actorId?: string): Promise<LeadDTO> {
  const current = await prisma.lead.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");

  if (input.email !== undefined && input.email) await assertEmailNotTaken(input.email, id);

  const data: Prisma.LeadUpdateInput = {};
  if (input.email !== undefined) {
    data.emailEnc = encryptOrNull(input.email);
    data.emailHash = input.email ? emailHash(input.email) : null;
  }
  if (input.phone !== undefined) data.phoneEnc = encryptOrNull(input.phone);
  for (const k of ["firstName", "lastName", "company", "website", "sector", "city", "country", "source", "notes"] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  if (input.status !== undefined && input.status) data.status = input.status;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
  data.lastActionAt = new Date();

  const lead = await prisma.lead.update({ where: { id }, data });

  const statusChanged = input.status !== undefined && input.status && input.status !== current.status;
  await prisma.leadHistory.create({
    data: {
      leadId: id,
      userId: actorId,
      type: statusChanged ? "status_change" : "updated",
      payload: statusChanged ? { from: current.status, to: input.status } : { fields: Object.keys(data) },
    },
  });
  return toDTO(lead);
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

// utilitaire éventuel pour d'autres services
export { normalizeEmail };
