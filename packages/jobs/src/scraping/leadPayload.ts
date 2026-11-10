import type { ScrapedLead } from "@crm/db";
import {
  resolveCompany,
  resolveContactNames,
  scraperEnrichment,
  tagsFromScrapedLead,
  cleanWebsiteUrl,
} from "@crm/db";

/** Faits de la fiche Google Maps ; l'analyse IA est conservée à part (`enrichment.siteAnalysis`). */
export function scrapedNotes(raw: ScrapedLead): string | null {
  const lines: string[] = [];
  if (raw.rating != null) lines.push(`Google Maps : ${String(raw.rating).replace(".", ",")}/5${raw.reviews != null ? ` (${raw.reviews} avis)` : ""}`);
  if (raw.address) lines.push(`Adresse : ${raw.address}`);
  if (!raw.ai && raw.enrichment) lines.push(raw.enrichment);
  return lines.length > 0 ? lines.join("\n") : null;
}

export function buildLeadCreateFromScraped(
  raw: ScrapedLead,
  sourceLabel: string,
  extraTags: string[] = [],
) {
  const company = resolveCompany(raw);
  const { firstName, lastName } = resolveContactNames(raw);
  const enrichment = scraperEnrichment(raw);
  const tags = [...new Set([...tagsFromScrapedLead(raw), ...extraTags])];

  return {
    firstName,
    lastName,
    company,
    website: cleanWebsiteUrl(raw.website),
    placeId: raw.place_id?.trim() || null,
    sector: raw.sector ?? null,
    city: raw.city ?? null,
    country: raw.country?.trim() || "France",
    source: sourceLabel,
    status: "NOUVEAU" as const,
    notes: scrapedNotes(raw),
    tags,
    enrichment: enrichment ? (enrichment as object) : undefined,
    lastActionAt: new Date(),
    deletedAt: null,
  };
}
