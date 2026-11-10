/**
 * Types et helpers partagés (web + jobs) pour les résultats du scraper (apps/scraper).
 */
import { classifyLinkedinUrl } from "./linkedin";

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
  | "unreachable"
  | "skipped"
  /** robots.txt interdit la visite du site (S-05). */
  | "robots_disallowed";

/** Analyse IA d'un établissement (skill crm-lead-analysis, côté scraper). */
export type ScrapedLeadAI = {
  summary: string;
  activity?: string | null;
  services?: string[];
  signals?: string[];
  fit_score: number;
  fit_reason?: string | null;
  decision_maker_role?: string | null;
  decision_maker_email?: string | null;
  decision_maker_phone?: string | null;
  best_phone?: string | null;
};

/** Téléphone lu sur le site (E.164 + affichage FR). */
export type ScrapedPhone = { number: string; display: string; kind: "fixe" | "mobile" | "special"; source?: string };

/** Contacts complémentaires lus sur le site (scraper : app/contacts.py). */
export type ScrapedLeadContacts = {
  phones: ScrapedPhone[];
  socials: Partial<Record<"linkedin" | "facebook" | "instagram" | "x" | "youtube" | "tiktok", string>>;
  /** Tous les liens LinkedIn publiés sur le site (page entreprise et profils) — E-04. */
  linkedin?: { url: string; kind: "company" | "person" }[];
  contact_url?: string | null;
  legal?: { siren?: string; siret?: string; legal_form?: string; capital?: string } | null;
};

/** Lead normalisé (contrat apps/scraper). */
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
  /** Rôle du décideur identifié (`name`) — ex. « Gérante ». */
  contact_role?: string | null;
  /** Résumé de la page d'accueil (= ai.summary quand l'analyse IA est active). */
  enrichment?: string | null;
  ai?: ScrapedLeadAI | null;
  contacts?: ScrapedLeadContacts | null;
  /** Page du site sectoriel (annuaire, liste de membres) où l'établissement a été trouvé. */
  source_url?: string | null;
  query?: string | null;
  scraped_at?: string | null;
};

/** Enveloppe HTTP renvoyée par le scraper. */
export type ScraperApiResponse = {
  ok: boolean;
  query?: string | null;
  count?: number;
  source?: string | null;
  scraped_at?: string | null;
  results: ScrapedLead[];
  meta?: {
    duration_ms?: number;
    filters_applied?: string[];
    robots?: { enforced?: boolean; domains_checked?: number; pages_allowed?: number; pages_disallowed?: number; disallowed_urls?: string[] } | null;
    rate?: { delay_ms?: number; rotate_user_agent?: boolean; proxy?: string | null; origin?: string } | null;
    sources?: Record<string, number>;
  };
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
/** Parties d'adresse qui désignent un service, pas une personne (contact@, agence@…). */
const GENERIC_LOCAL_PARTS = new Set([
  "contact", "contacts", "info", "infos", "information", "hello", "bonjour", "salut", "accueil", "agence", "admin",
  "administration", "office", "bureau", "commercial", "commerciale", "sales", "vente", "ventes", "location", "gestion",
  "transaction", "transactions", "immobilier", "immo", "direction", "secretariat", "support", "service", "services",
  "team", "equipe", "mail", "email", "rh", "recrutement", "compta", "comptabilite", "facturation", "devis", "rdv",
  "booking", "reservation", "client", "clients", "web", "webmaster", "marketing", "communication", "presse", "news",
]);

export function namesFromEmail(email: string): { firstName: string | null; lastName: string | null } {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (!local) return { firstName: null, lastName: null };

  const parts = local.split(/[._+-]+/).filter((p) => p.length > 0);
  // Pas de nom inventé à partir d'une adresse de service ou d'un identifiant (chiffres).
  if (parts.some((p) => GENERIC_LOCAL_PARTS.has(p) || /\d/.test(p))) return { firstName: null, lastName: null };
  const [first, ...rest] = parts;
  if (!first) return { firstName: null, lastName: null };
  // « j.martin@ » : l'initiale n'est pas un prénom, mais le nom de famille est fiable.
  if (first.length < 2) return { firstName: null, lastName: rest.map(capitalizePart).join(" ") || null };
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
  if (raw.source_url) scraper.sourceUrl = raw.source_url;
  const out: Record<string, unknown> = {};
  if (Object.keys(scraper).length > 0) out.scraper = scraper;
  if (raw.ai) {
    out.siteAnalysis = {
      summary: raw.ai.summary,
      activity: raw.ai.activity ?? null,
      services: raw.ai.services ?? [],
      signals: raw.ai.signals ?? [],
      fitScore: raw.ai.fit_score,
      fitReason: raw.ai.fit_reason ?? null,
      decisionMaker: raw.name ? { name: raw.name, role: raw.contact_role ?? raw.ai.decision_maker_role ?? null } : null,
    };
  } else if (raw.enrichment) {
    out.siteAnalysis = { summary: raw.enrichment };
  }
  // Données d'entreprise publiques (non personnelles) : en clair. Téléphones et emails → scrapedPrivateContacts().
  const c = raw.contacts;
  // Pages LinkedIn d'entreprise publiées sur le site : publiques. Les profils de personnes → contactsEnc.
  const linkedinCompany = (c?.linkedin ?? []).filter((l) => l.kind === "company").map((l) => l.url);
  if (c && (Object.keys(c.socials ?? {}).length || linkedinCompany.length || c.contact_url || c.legal)) {
    out.siteContacts = {
      legal: c.legal ?? null,
      socials: c.socials ?? {},
      ...(linkedinCompany.length ? { linkedinCompany } : {}),
      contactUrl: c.contact_url ?? null,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Coordonnées supplémentaires (données personnelles possibles : ligne directe, email nominatif) —
 * à stocker **chiffrées** (`Lead.contactsEnc`), jamais en clair dans `enrichment`.
 */
export type LeadPrivateContacts = {
  phones: ScrapedPhone[];
  decisionMaker?: { email?: string | null; phone?: string | null } | null;
  /** Profils LinkedIn de personnes publiés sur le site de l'entreprise (E-04, « vérifiés »). */
  linkedinProfiles?: string[];
};

export function scrapedPrivateContacts(raw: ScrapedLead): LeadPrivateContacts | null {
  const phones = raw.contacts?.phones ?? [];
  const dmEmail = raw.ai?.decision_maker_email ?? null;
  const dmPhone = raw.ai?.decision_maker_phone ?? null;
  const linkedinProfiles = (raw.contacts?.linkedin ?? []).filter((l) => l.kind === "person").map((l) => l.url);
  if (!phones.length && !dmEmail && !dmPhone && !linkedinProfiles.length) return null;
  return {
    phones,
    decisionMaker: dmEmail || dmPhone ? { email: dmEmail, phone: dmPhone } : null,
    ...(linkedinProfiles.length ? { linkedinProfiles } : {}),
  };
}

/** Score d'adéquation IA (0-100) ou null si la fiche n'a pas été analysée. */
export function scrapedFitScore(raw: Pick<ScrapedLead, "ai">): number | null {
  const s = raw.ai?.fit_score;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

/** URL de site sans paramètres de suivi (utm_*, gclid, fbclid…) ajoutés par Google Maps. */
export function cleanWebsiteUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|msclkid$|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    const out = u.toString();
    return u.pathname === "/" && !u.search && !u.hash ? out.replace(/\/$/, "") : out;
  } catch {
    return raw;
  }
}

export function tagsFromScrapedLead(raw: ScrapedLead): string[] {
  // L'identifiant Google Maps va dans la colonne `placeId` (dédoublonnage), pas dans les tags visibles.
  // Libellés lisibles : ces tags s'affichent tels quels sur les fiches et servent de filtres de segment.
  const tags: string[] = ["Prospection IA"];
  if (raw.email_status === "no_email") tags.push("Sans email");
  if (raw.email_status === "no_website") tags.push("Sans site web");
  if (raw.source === "directories") tags.push("Site sectoriel");
  if (raw.name?.trim()) tags.push("Décideur identifié");
  const fit = scrapedFitScore(raw);
  if (fit != null && fit >= 70) tags.push("Cible IA");
  return tags;
}

function parseLeadAI(v: unknown): ScrapedLeadAI | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.summary !== "string" || typeof a.fit_score !== "number") return null;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    summary: a.summary,
    activity: typeof a.activity === "string" ? a.activity : null,
    services: strings(a.services),
    signals: strings(a.signals),
    fit_score: Math.max(0, Math.min(100, Math.round(a.fit_score))),
    fit_reason: typeof a.fit_reason === "string" ? a.fit_reason : null,
    decision_maker_role: typeof a.decision_maker_role === "string" ? a.decision_maker_role : null,
    decision_maker_email: typeof a.decision_maker_email === "string" ? a.decision_maker_email : null,
    decision_maker_phone: typeof a.decision_maker_phone === "string" ? a.decision_maker_phone : null,
    best_phone: typeof a.best_phone === "string" ? a.best_phone : null,
  };
}

function parseContacts(v: unknown): ScrapedLeadContacts | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const phones = (Array.isArray(c.phones) ? c.phones : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && /^\+\d{8,15}$/.test(String((p as { number?: unknown }).number ?? "")))
    .map((p) => ({
      number: String(p.number),
      display: typeof p.display === "string" ? p.display : String(p.number),
      kind: (p.kind === "mobile" || p.kind === "special" ? p.kind : "fixe") as ScrapedPhone["kind"],
      source: typeof p.source === "string" ? p.source : undefined,
    }))
    .slice(0, 8);
  const socials: ScrapedLeadContacts["socials"] = {};
  if (c.socials && typeof c.socials === "object") {
    for (const [k, val] of Object.entries(c.socials as Record<string, unknown>)) {
      if (typeof val === "string" && /^https:\/\//.test(val) && ["linkedin", "facebook", "instagram", "x", "youtube", "tiktok"].includes(k)) {
        socials[k as keyof ScrapedLeadContacts["socials"]] = val;
      }
    }
  }
  const legalRaw = c.legal && typeof c.legal === "object" ? (c.legal as Record<string, unknown>) : null;
  const legal = legalRaw
    ? Object.fromEntries(Object.entries(legalRaw).filter(([k, val]) => ["siren", "siret", "legal_form", "capital"].includes(k) && typeof val === "string"))
    : null;
  const contactUrl = typeof c.contact_url === "string" && /^https?:\/\//.test(c.contact_url) ? c.contact_url : null;
  // Tous les liens LinkedIn du site : `socials.linkedin_links` (URL séparées par un espace, app/contacts.py)
  // ou tableau `linkedin: [{ url }]`.
  const linkedinRaw = [
    ...(typeof (c.socials as Record<string, unknown> | undefined)?.linkedin_links === "string"
      ? String((c.socials as Record<string, unknown>).linkedin_links).split(/\s+/)
      : []),
    ...(Array.isArray(c.linkedin) ? c.linkedin : []).map((l) => (l && typeof l === "object" ? String((l as { url?: unknown }).url ?? "") : "")),
  ];
  const seenLinkedin = new Set<string>();
  const linkedin = linkedinRaw
    .filter((url) => url && !seenLinkedin.has(url.toLowerCase()) && seenLinkedin.add(url.toLowerCase()))
    .map((url) => ({ url, kind: classifyLinkedinUrl(url) }))
    .filter((l): l is { url: string; kind: "company" | "person" } => l.kind !== null)
    .slice(0, 10);
  if (!phones.length && !Object.keys(socials).length && !linkedin.length && !contactUrl && !(legal && Object.keys(legal).length)) return null;
  return {
    phones,
    socials,
    ...(linkedin.length ? { linkedin } : {}),
    contact_url: contactUrl,
    legal: legal && Object.keys(legal).length ? legal : null,
  };
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
    contact_role: typeof r.contact_role === "string" ? r.contact_role.trim() || null : null,
    enrichment: typeof r.enrichment === "string" ? r.enrichment.trim() || null : null,
    ai: parseLeadAI(r.ai),
    contacts: parseContacts(r.contacts),
    source_url: typeof r.source_url === "string" && /^https?:\/\//.test(r.source_url) ? r.source_url : null,
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
