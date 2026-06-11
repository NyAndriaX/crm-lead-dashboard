import { prisma, buildLeadWhereFromSegmentFilters, strictCreatorWhere, type DataScope, type LeadSegmentFilters } from "@crm/db";
import { ApiError } from "../api";
import type { CreateSegmentInput, UpdateSegmentInput } from "../schemas/campaign";
import { decryptOrNull } from "../crypto";

export async function listSegments(scope: DataScope) {
  return prisma.segment.findMany({
    where: strictCreatorWhere(scope.userId),
    orderBy: { createdAt: "desc" },
  });
}

export async function getSegment(id: string, scope: DataScope) {
  const s = await prisma.segment.findFirst({
    where: { id, ...strictCreatorWhere(scope.userId) },
  });
  if (!s) throw new ApiError(404, "Segment introuvable", "not_found");
  return s;
}

export async function createSegment(input: CreateSegmentInput, scope: DataScope) {
  return prisma.segment.create({
    data: {
      name: input.name,
      filters: input.filters as object,
      createdById: scope.userId,
    },
  });
}

export async function updateSegment(id: string, input: UpdateSegmentInput, scope: DataScope) {
  await getSegment(id, scope);
  return prisma.segment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filters !== undefined ? { filters: input.filters as object } : {}),
    },
  });
}

export async function deleteSegment(id: string, scope: DataScope) {
  await getSegment(id, scope);
  const active = await prisma.campaign.count({
    where: { segmentId: id, status: { in: ["SENDING", "SCHEDULED"] } },
  });
  if (active > 0) {
    throw new ApiError(
      409,
      "Ce segment est utilisé par une campagne en cours. Mettez-la en pause ou annulez-la avant de supprimer le segment.",
      "segment_in_use",
    );
  }
  await prisma.$transaction([
    prisma.campaign.updateMany({ where: { segmentId: id }, data: { segmentId: null } }),
    prisma.segment.delete({ where: { id } }),
  ]);
}

function segmentWhere(filters: unknown): ReturnType<typeof buildLeadWhereFromSegmentFilters> {
  return buildLeadWhereFromSegmentFilters({
    ...(filters as Partial<LeadSegmentFilters>),
    includeDeleted: false,
  });
}

/** Compte les leads correspondant au segment (aperçu côté API). */
export async function countSegmentLeads(filters: unknown): Promise<number> {
  return prisma.lead.count({ where: segmentWhere(filters) });
}

export type SegmentLeadPreview = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  status: string;
  score: number;
  tags: string[];
};

/** Liste paginée des leads ciblés par un segment. */
export async function listSegmentLeads(
  filters: unknown,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ data: SegmentLeadPreview[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = segmentWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        emailEnc: true,
        status: true,
        score: true,
        tags: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      company: r.company,
      email: decryptOrNull(r.emailEnc),
      status: r.status,
      score: r.score,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    })),
    total,
    page,
    pageSize,
  };
}

export function segmentModeLabel(filters: unknown): string {
  const f = filters as LeadSegmentFilters;
  if (f.mode === "manual") return "Sélection manuelle";
  if (f.mode === "tags") return "Par tags";
  return "Filtres dynamiques";
}
