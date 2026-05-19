import type { ScrapedLead } from "@crm/db";
import {
  resolveCompany,
  resolveContactNames,
  scraperEnrichment,
  tagsFromScrapedLead,
} from "@crm/db";

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
    website: raw.website ?? null,
    sector: raw.sector ?? null,
    city: raw.city ?? null,
    country: raw.country?.trim() || "France",
    source: sourceLabel,
    status: "NOUVEAU" as const,
    notes: raw.address ? `Adresse scrapée : ${raw.address}` : null,
    tags,
    enrichment: enrichment ? (enrichment as object) : undefined,
    lastActionAt: new Date(),
    deletedAt: null,
  };
}
