import type { LeadStatus, Prisma } from "@prisma/client";

/** Lead non supprimé (Mongo : champ absent ou null). */
export const LEAD_NOT_DELETED: Prisma.LeadWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

/** Filtres segment = même forme que `leadFilters` (apps/web) pour buildWhere. */
export type LeadSegmentFilters = {
  includeDeleted?: boolean;
  q?: string;
  status?: string;
  source?: string;
  sector?: string;
  city?: string;
  country?: string;
  assignedToId?: string;
  tag?: string;
  scoreMin?: number;
  scoreMax?: number;
  createdAfter?: string | Date;
  createdBefore?: string | Date;
};

export function buildLeadWhereFromSegmentFilters(f: LeadSegmentFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (!f.includeDeleted) Object.assign(where, LEAD_NOT_DELETED);
  if (f.status) where.status = f.status as LeadStatus;
  if (f.source) where.source = f.source;
  if (f.sector) where.sector = f.sector;
  if (f.city) where.city = f.city;
  if (f.country) where.country = f.country;
  if (f.assignedToId) where.assignedToId = f.assignedToId;
  if (f.tag) where.tags = { has: f.tag };
  if (f.scoreMin != null || f.scoreMax != null) {
    where.score = {
      ...(f.scoreMin != null ? { gte: f.scoreMin } : {}),
      ...(f.scoreMax != null ? { lte: f.scoreMax } : {}),
    };
  }
  if (f.createdAfter || f.createdBefore) {
    where.createdAt = {
      ...(f.createdAfter ? { gte: new Date(f.createdAfter) } : {}),
      ...(f.createdBefore ? { lte: new Date(f.createdBefore) } : {}),
    };
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
