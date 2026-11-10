import type { LeadStatus, Prisma } from "@prisma/client";

/** Lead non supprimé (soft delete : `deletedAt` NULL). */
export const LEAD_NOT_DELETED: Prisma.LeadWhereInput = { deletedAt: null };

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
  if (f.tag) where.tags = { array_contains: [f.tag] };
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
  // Collation utf8mb4_0900_ai_ci : `contains` (LIKE) est déjà insensible à la casse et aux accents.
  if (f.q) {
    where.OR = [
      { firstName: { contains: f.q } },
      { lastName: { contains: f.q } },
      { company: { contains: f.q } },
      { notes: { contains: f.q } },
    ];
  }
  return where;
}
