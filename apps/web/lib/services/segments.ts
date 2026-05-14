import { prisma } from "@crm/db";
import { ApiError } from "../api";
import type { CreateSegmentInput, UpdateSegmentInput } from "../schemas/campaign";
import { buildWhere } from "./leads";
import type { LeadFilters } from "../schemas/lead";

export async function listSegments() {
  return prisma.segment.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getSegment(id: string) {
  const s = await prisma.segment.findUnique({ where: { id } });
  if (!s) throw new ApiError(404, "Segment introuvable", "not_found");
  return s;
}

export async function createSegment(input: CreateSegmentInput) {
  return prisma.segment.create({
    data: {
      name: input.name,
      filters: input.filters as object,
    },
  });
}

export async function updateSegment(id: string, input: UpdateSegmentInput) {
  await getSegment(id);
  return prisma.segment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filters !== undefined ? { filters: input.filters as object } : {}),
    },
  });
}

export async function deleteSegment(id: string) {
  await getSegment(id);
  const used = await prisma.campaign.count({ where: { segmentId: id } });
  if (used > 0) throw new ApiError(409, "Segment utilisé par une ou plusieurs campagnes", "segment_in_use");
  await prisma.segment.delete({ where: { id } });
}

/** Compte les leads correspondant au segment (aperçu M-07). */
export async function countSegmentLeads(filters: unknown): Promise<number> {
  const where = buildWhere({ ...(filters as Partial<LeadFilters>), includeDeleted: false });
  return prisma.lead.count({ where });
}
