import { placeIdTag, prisma, isEmailHashBlocked, GDPR_ERASE_REASON, type ScrapedLead } from "@crm/db";

export type ScrapedDedupResult = {
  duplicate: boolean;
  reason: string | null;
};

export async function leadExistsByPlaceId(placeId: string): Promise<boolean> {
  const found = await prisma.lead.findFirst({
    where: {
      deletedAt: null,
      tags: { array_contains: placeIdTag(placeId) },
    },
    select: { id: true },
  });
  return !!found;
}

export async function isScrapedLeadDuplicateInCrm(
  raw: ScrapedLead,
  emailHashFn: (email: string) => string,
): Promise<ScrapedDedupResult> {
  const email = raw.email?.trim().toLowerCase();
  if (email) {
    const h = emailHashFn(email);
    const blocked = await isEmailHashBlocked(h);
    if (blocked.blocked) {
      const msg =
        blocked.reason === GDPR_ERASE_REASON
          ? "suppression RGPD (contact interdit)"
          : "email bloqué";
      return { duplicate: true, reason: msg };
    }
  }

  const placeId = raw.place_id?.trim();
  if (placeId && (await leadExistsByPlaceId(placeId))) {
    return { duplicate: true, reason: "déjà en base (place_id)" };
  }
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
