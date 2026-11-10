import { prisma } from "@crm/db";
import { ApiError } from "../api";
import type { CreateSegmentInput, UpdateSegmentInput } from "../schemas/campaign";
import { buildWhere, toDTO } from "./leads";
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

/** Compte les leads correspondant au segment (aperçu côté API). */
export async function countSegmentLeads(filters: unknown): Promise<number> {
  const where = buildWhere({ ...(filters as Partial<LeadFilters>), includeDeleted: false });
  return prisma.lead.count({ where });
}

/** Aperçu d'audience : volume, destinataires joignables (email connu, hors blacklist) et échantillon. */
export async function previewSegment(filters: Partial<LeadFilters>) {
  const where = buildWhere({ ...filters, includeDeleted: false });
  const [total, withEmail, byStatus, sample] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where: { ...where, emailHash: { not: null } }, select: { emailHash: true }, take: 50_000 }),
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.findMany({ where, orderBy: [{ score: "desc" }, { createdAt: "desc" }], take: 8 }),
  ]);
  const hashes = withEmail.map((l) => l.emailHash).filter((h): h is string => !!h);
  let blacklisted = 0;
  for (let i = 0; i < hashes.length; i += 1000) {
    blacklisted += await prisma.blacklist.count({ where: { emailHash: { in: hashes.slice(i, i + 1000) } } });
  }
  return {
    total,
    reachable: hashes.length - blacklisted,
    noEmail: total - hashes.length,
    blacklisted,
    byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    sample: sample.map((l) => {
      const d = toDTO(l);
      return { id: d.id, firstName: d.firstName, lastName: d.lastName, company: d.company, email: d.email, sector: d.sector, city: d.city, status: d.status, score: d.score };
    }),
  };
}

/** Segments + taille d'audience joignable (une requête de comptage par segment). */
export async function listSegmentsWithCounts() {
  const [rows, usage] = await Promise.all([
    listSegments(),
    prisma.campaign.groupBy({ by: ["segmentId"], _count: { _all: true } }),
  ]);
  return Promise.all(
    rows.map(async (s) => {
      const p = await previewSegment(s.filters as Partial<LeadFilters>);
      return {
        ...s,
        leadCount: p.total,
        reachable: p.reachable,
        campaigns: usage.find((u) => u.segmentId === s.id)?._count._all ?? 0,
      };
    }),
  );
}
