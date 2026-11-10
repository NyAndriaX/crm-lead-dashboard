import { prisma, type ScrapedLead } from "@crm/db";

export type ScrapedDedupResult = {
  duplicate: boolean;
  reason: string | null;
  kind: "internal" | "existing" | null;
};

/** Vérifie si un place_id existe déjà en base (colonne indexée `leads.placeId`). */
export async function leadExistsByPlaceId(placeId: string): Promise<boolean> {
  const found = await prisma.lead.findFirst({
    where: {
      deletedAt: null,
      placeId: placeId.trim(),
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

/**
 * Re-vérification au moment de l'injection dans le CRM (un lead a pu être créé entre-temps) :
 * place_id prioritaire, email seulement si pas de place_id.
 */
export async function isScrapedLeadDuplicateInCrm(
  raw: ScrapedLead,
  emailHashFn: (email: string) => string,
): Promise<{ duplicate: boolean; reason: string | null }> {
  const placeId = raw.place_id?.trim();
  if (placeId && (await leadExistsByPlaceId(placeId))) {
    return { duplicate: true, reason: "déjà en base (place_id)" };
  }
  const email = raw.email?.trim().toLowerCase();
  if (!placeId && email) {
    const exists = await prisma.lead.findFirst({
      where: { emailHash: emailHashFn(email), deletedAt: null },
      select: { id: true },
    });
    if (exists) return { duplicate: true, reason: "déjà en base (email)" };
  }
  return { duplicate: false, reason: null };
}
