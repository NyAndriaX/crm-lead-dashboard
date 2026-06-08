/**
 * Types et helpers partagés (web + worker) pour les résultats du scraper
 * externe `crm-leads-scraper`.
 */

export type ScrapeSource = "google_maps" | "directories" | "linkedin" | "website";

export type ScrapeConfig = {
  sources: ScrapeSource[];
  keywords: string;
  location: { city?: string | null; country?: string | null; radiusKm?: number | null };
  companyType?: string | null;
  companySize?: string | null;
  language?: string | null;
  limit: number;
  rate: { delayMs: number; retries: number; rotateUserAgent: boolean; proxyUrl?: string | null };
};

export type ScrapedLeadEmailStatus =
  | "found"
  | "found_legal"
  | "no_email"
  | "no_website"
  | "invalid_email"
  | "unreachable";

/** Lead normalisé (contrat crm-leads-scraper). */
export type ScrapedLead = {
  source: ScrapeSource;
  company?: string | null;
  /** Contact humain uniquement — pas le nom de l'établissement Maps. */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  sector?: string | null;
  rating?: number | null;
  reviews?: number | null;
  place_id?: string | null;
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  email_status?: ScrapedLeadEmailStatus | null;
  homepage_title?: string | null;
  homepage_excerpt?: string | null;
  homepage_summary?: string | null;
  homepage_enrichment_status?: string | null;
  /** Synthèse IA entreprise renvoyée par le scraper (champ `enrichment` de l'API). */
  enrichment?: string | null;
  query?: string | null;
  scraped_at?: string | null;
};

/** Enveloppe HTTP renvoyée par crm-leads-scraper. */
export type ScraperApiResponse = {
  ok: boolean;
  query?: string | null;
  count?: number;
  source?: string | null;
  scraped_at?: string | null;
  results: ScrapedLead[];
  meta?: { duration_ms?: number; filters_applied?: string[] };
  error?: string | null;
};

export function resolveCompany(raw: Pick<ScrapedLead, "company" | "name">): string | null {
  const c = raw.company?.trim();
  if (c) return c;
  const legacy = raw.name?.trim();
  return legacy || null;
}

function capitalizePart(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Déduit prénom / nom depuis la partie locale de l'email (ex. jean.dupont@…).
 * Best-effort — les boîtes génériques (contact@, info@) ne donnent qu'un prénom.
 */
export function namesFromEmail(email: string): { firstName: string | null; lastName: string | null } {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (!local) return { firstName: null, lastName: null };

  const parts = local.split(/[._+-]+/).filter((p) => p.length > 0);
  const [first, ...rest] = parts;
  if (!first) return { firstName: null, lastName: null };
  if (rest.length > 0) {
    return {
      firstName: capitalizePart(first),
      lastName: rest.map(capitalizePart).join(" ") || null,
    };
  }
  return { firstName: capitalizePart(first), lastName: null };
}

export function resolveContactNames(
  raw: Pick<ScrapedLead, "name" | "company" | "email">,
): { firstName: string | null; lastName: string | null } {
  const contact = raw.name?.trim();
  if (contact) {
    const parts = contact.split(/\s+/);
    return {
      firstName: parts[0] ?? null,
      lastName: parts.slice(1).join(" ") || null,
    };
  }
  const email = raw.email?.trim();
  if (email && email.includes("@")) {
    return namesFromEmail(email);
  }
  return { firstName: null, lastName: null };
}

/** Au moins un identifiant métier pour créer un lead CRM. */
export function isIdentifiableLead(raw: ScrapedLead): boolean {
  if (resolveCompany(raw)) return true;
  if (raw.email?.trim()) return true;
  if (raw.phone?.trim() && raw.website?.trim()) return true;
  return false;
}

/** Métadonnées Maps stockées dans `Lead.enrichment.scraper`. */
export function scraperEnrichment(raw: ScrapedLead): Record<string, unknown> | undefined {
  const scraper: Record<string, unknown> = {};
  if (raw.place_id) scraper.placeId = raw.place_id;
  if (raw.maps_url) scraper.mapsUrl = raw.maps_url;
  if (raw.rating != null) scraper.rating = raw.rating;
  if (raw.reviews != null) scraper.reviews = raw.reviews;
  if (raw.email_status) scraper.emailStatus = raw.email_status;
  if (raw.query) scraper.query = raw.query;
  if (raw.scraped_at) scraper.scrapedAt = raw.scraped_at;
  if (raw.latitude != null) scraper.latitude = raw.latitude;
  if (raw.longitude != null) scraper.longitude = raw.longitude;
  if (raw.source) scraper.source = raw.source;
  if (raw.homepage_title) scraper.homepageTitle = raw.homepage_title;
  if (raw.homepage_excerpt) scraper.homepageExcerpt = raw.homepage_excerpt;
  if (raw.homepage_summary) scraper.homepageSummary = raw.homepage_summary;
  if (raw.homepage_enrichment_status) {
    scraper.homepageStatus = raw.homepage_enrichment_status;
  }

  const out: Record<string, unknown> = {};
  if (Object.keys(scraper).length > 0) out.scraper = scraper;

  const enrichmentText = raw.enrichment?.trim() || raw.homepage_summary?.trim() || null;
  if (enrichmentText) {
    out.summary = enrichmentText;
    out.summarySource = raw.enrichment?.trim() ? "scraper" : "scraper_homepage";
    out.summaryAt = raw.scraped_at ?? new Date().toISOString();
    out.aiBrief = {
      summary: enrichmentText,
      angle: raw.enrichment?.trim() ? "Contexte entreprise (scraping)" : "Prospection — page d'accueil",
      score: 50,
      source: "scraper",
      at: raw.scraped_at ?? new Date().toISOString(),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function tagsFromScrapedLead(raw: ScrapedLead): string[] {
  const tags: string[] = ["scraping"];
  if (raw.place_id?.trim()) tags.push(`place:${raw.place_id.trim()}`);
  if (raw.email_status === "found_legal") tags.push("email-legal");
  if (raw.email_status === "no_email") tags.push("sans-email");
  if (raw.email_status === "no_website") tags.push("sans-site");
  return tags;
}

export function placeIdTag(placeId: string): string {
  return `place:${placeId.trim()}`;
}

function normalizeOneLead(item: unknown, fallbackQuery?: string): ScrapedLead | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const source = (r.source as ScrapeSource) || "google_maps";
  const company =
    (typeof r.company === "string" ? r.company : null) ||
    (typeof r.name === "string" && !r.company ? r.name : null);
  const contactName =
    typeof r.name === "string" && r.company ? (r.name as string) : null;

  return {
    source,
    company: company?.trim() || null,
    name: contactName?.trim() || null,
    email: typeof r.email === "string" ? r.email.trim().toLowerCase() || null : null,
    phone: typeof r.phone === "string" ? r.phone.trim() || null : null,
    website: typeof r.website === "string" ? r.website.trim() || null : null,
    address: typeof r.address === "string" ? r.address.trim() || null : null,
    city: typeof r.city === "string" ? r.city.trim() || null : null,
    country: typeof r.country === "string" ? r.country.trim() || null : null,
    sector:
      (typeof r.sector === "string" ? r.sector : null) ||
      (typeof r.category === "string" ? r.category : null) ||
      null,
    rating: typeof r.rating === "number" ? r.rating : null,
    reviews: typeof r.reviews === "number" ? r.reviews : null,
    place_id: typeof r.place_id === "string" ? r.place_id : null,
    maps_url: typeof r.maps_url === "string" ? r.maps_url : null,
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    email_status: (r.email_status as ScrapedLeadEmailStatus) ?? null,
    homepage_title: typeof r.homepage_title === "string" ? r.homepage_title : null,
    homepage_excerpt: typeof r.homepage_excerpt === "string" ? r.homepage_excerpt : null,
    homepage_summary: typeof r.homepage_summary === "string" ? r.homepage_summary : null,
    homepage_enrichment_status:
      typeof r.homepage_enrichment_status === "string"
        ? r.homepage_enrichment_status
        : null,
    enrichment: typeof r.enrichment === "string" ? r.enrichment.trim() || null : null,
    query: (typeof r.query === "string" ? r.query : null) || fallbackQuery || null,
    scraped_at: typeof r.scraped_at === "string" ? r.scraped_at : null,
  };
}

/** Parse l'enveloppe API ou un tableau brut de leads. */
export function parseScraperPayload(
  payload: unknown,
  fallbackQuery?: string,
): { leads: ScrapedLead[]; meta?: ScraperApiResponse["meta"]; query?: string } {
  if (Array.isArray(payload)) {
    const leads = payload
      .map((item) => normalizeOneLead(item, fallbackQuery))
      .filter((l): l is ScrapedLead => l !== null);
    return { leads };
  }
  if (!payload || typeof payload !== "object") return { leads: [] };
  const body = payload as ScraperApiResponse & { results?: unknown[] };
  const q = body.query ?? fallbackQuery;
  const leads = (body.results ?? [])
    .map((item) => normalizeOneLead(item, q ?? undefined))
    .filter((l): l is ScrapedLead => l !== null);
  return { leads, meta: body.meta, query: q ?? undefined };
}
