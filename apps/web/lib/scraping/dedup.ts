import { placeIdTag, prisma, type ScrapedLead } from "@crm/db";

export type ScrapedDedupResult = {
  duplicate: boolean;
  reason: string | null;
};

export async function leadExistsByPlaceId(placeId: string): Promise<boolean> {
  const found = await prisma.lead.findFirst({
    where: {
      deletedAt: null,
      tags: { has: placeIdTag(placeId) },
    },
    select: { id: true },
  });
  return !!found;
}

export async function isScrapedLeadDuplicateInCrm(
  raw: ScrapedLead,
  emailHashFn: (email: string) => string,
): Promise<ScrapedDedupResult> {
  const placeId = raw.place_id?.trim();
  if (placeId && (await leadExistsByPlaceId(placeId))) {
    return { duplicate: true, reason: "déjà en base (place_id)" };
  }
  const email = raw.email?.trim().toLowerCase();
  if (!placeId && email) {
    const h = emailHashFn(email);
    const exists = await prisma.lead.findFirst({
      where: { emailHash: h, deletedAt: null },
      select: { id: true },
    });
    if (exists) return { duplicate: true, reason: "déjà en base (email)" };
  }
  return { duplicate: false, reason: null };
}
