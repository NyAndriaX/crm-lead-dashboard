import { placeIdTag, prisma, isEmailHashBlocked, GDPR_ERASE_REASON, type ScrapedLead } from "@crm/db";

export type ScrapedDedupResult = {
  duplicate: boolean;
  reason: string | null;
  kind: "internal" | "existing" | null;
};

/** Vérifie si un place_id existe déjà en base (enrichment.scraper.placeId). */
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

/**
 * Dédoublonnage avant buffer : place_id prioritaire ; email seulement si pas de place_id.
 */
export async function checkScrapedLeadDuplicate(
  lead: ScrapedLead,
  seen: { placeId: Set<string>; email: Set<string>; companyCity: Set<string> },
  emailHashFn: (email: string) => string,
): Promise<ScrapedDedupResult> {
  const placeId = lead.place_id?.trim() || null;
  const email = lead.email?.trim().toLowerCase() || null;
  const company = (lead.company ?? "").trim().toLowerCase();
  const city = (lead.city ?? "").trim().toLowerCase();
  const companyCityKey = company ? `${company}|${city}` : "";

  if (email) {
    const h = emailHashFn(email);
    const blocked = await isEmailHashBlocked(h);
    if (blocked.blocked) {
      const msg =
        blocked.reason === GDPR_ERASE_REASON
          ? "suppression RGPD (contact interdit)"
          : "email bloqué";
      return { duplicate: true, reason: msg, kind: "existing" };
    }
  }

  if (placeId) {
    if (seen.placeId.has(placeId)) {
      return { duplicate: true, reason: "doublon interne (place_id)", kind: "internal" };
    }
    if (await leadExistsByPlaceId(placeId)) {
      return { duplicate: true, reason: "déjà en base (place_id)", kind: "existing" };
    }
    return { duplicate: false, reason: null, kind: null };
  }

  if (email) {
    if (seen.email.has(email)) {
      return { duplicate: true, reason: "doublon interne (email)", kind: "internal" };
    }
    const h = emailHashFn(email);
    const exists = await prisma.lead.findFirst({
      where: { emailHash: h, deletedAt: null },
      select: { id: true },
    });
    if (exists) {
      return { duplicate: true, reason: "déjà en base (email)", kind: "existing" };
    }
    return { duplicate: false, reason: null, kind: null };
  }

  if (companyCityKey && seen.companyCity.has(companyCityKey)) {
    return { duplicate: true, reason: "doublon interne (entreprise+ville)", kind: "internal" };
  }

  return { duplicate: false, reason: null, kind: null };
}

export function trackScrapedLeadSeen(
  lead: ScrapedLead,
  seen: { placeId: Set<string>; email: Set<string>; companyCity: Set<string> },
): void {
  const placeId = lead.place_id?.trim();
  if (placeId) seen.placeId.add(placeId);
  const email = lead.email?.trim().toLowerCase();
  if (email) seen.email.add(email);
  const company = (lead.company ?? "").trim().toLowerCase();
  const city = (lead.city ?? "").trim().toLowerCase();
  if (company) seen.companyCity.add(`${company}|${city}`);
}
