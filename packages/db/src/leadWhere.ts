import type { LeadStatus, Prisma } from "@prisma/client";

export const LEAD_NOT_DELETED: Prisma.LeadWhereInput = {
  deletedAt: null,
};

export type LeadSegmentFilters = {
  includeDeleted?: boolean;
  /** filter (défaut) | manual | tags */
  mode?: "filter" | "manual" | "tags";
  /** Sélection manuelle de leads (mode manual). */
  leadIds?: string[];
  /** Tags multiples — mode tags : au moins un tag correspond. */
  tags?: string[];
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
  const mode = f.mode ?? "filter";

  if (mode === "manual" && f.leadIds?.length) {
    return {
      ...(!f.includeDeleted ? LEAD_NOT_DELETED : {}),
      id: { in: f.leadIds },
    };
  }

  if (mode === "tags" && f.tags?.length) {
    const tagList = f.tags.map((t) => t.trim()).filter(Boolean);
    if (tagList.length === 1) {
      return {
        ...(!f.includeDeleted ? LEAD_NOT_DELETED : {}),
        tags: { array_contains: tagList[0] },
      };
    }
    if (tagList.length > 1) {
      return {
        ...(!f.includeDeleted ? LEAD_NOT_DELETED : {}),
        OR: tagList.map((t) => ({ tags: { array_contains: t } })),
      };
    }
  }

  const where: Prisma.LeadWhereInput = {};
  if (!f.includeDeleted) Object.assign(where, LEAD_NOT_DELETED);
  if (f.status) where.status = f.status as LeadStatus;
  if (f.source) where.source = f.source;
  if (f.sector) where.sector = f.sector;
  if (f.city) where.city = f.city;
  if (f.country) where.country = f.country;
  if (f.assignedToId) where.assignedToId = f.assignedToId;
  if (f.tag) {
    where.tags = { array_contains: f.tag };
  }
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
      { firstName: { contains: f.q } },
      { lastName: { contains: f.q } },
      { company: { contains: f.q } },
      { notes: { contains: f.q } },
    ];
  }
  return where;
}
