/**
 * Engine d'enrichissement de leads (module Enrichissement E-01 → E-09).
 *
 * Principe "dry-run / stub-first" : chaque provider fonctionne SANS clé API
 * (heuristiques + ressources gratuites : DNS MX, RSS Google News, API publique
 * Recherche d'entreprises, liens publiés sur le site). Les clés des fournisseurs
 * payants (Hunter.io, Dropcontact, Pappers) se règlent dans Configuration ›
 * Enrichissement (INT-03, stockées chiffrées), avec repli sur les variables
 * d'environnement (HUNTER_API_KEY, DROPCONTACT_API_KEY, PAPPERS_API_KEY).
 *
 * Le résultat est fusionné dans `Lead.enrichment` (champ Json) avec, pour
 * chaque bloc, la `source` et la date — exigence E-09 (traçabilité). Le score
 * du lead est recalculé après chaque enrichissement (E-07).
 */
import dns from "node:dns/promises";
import { prisma, recomputeLeadScore, siteLinkedinLinks, type LeadPrivateContacts, type ScoringWeights } from "@crm/db";
import { decryptOrNull, encryptOrNull, emailHash } from "@/lib/crypto";
import { getEnrichmentConfig } from "@/lib/services/enrichmentConfig";
import { dropcontactFindEmail, hunterFindEmail, pappersSearch, rechercheEntreprisesSearch } from "@/lib/services/enrichmentApis";

export type EnrichProvider = "email" | "emailVerify" | "company" | "linkedin" | "news" | "social";

export const ALL_PROVIDERS: EnrichProvider[] = [
  "email", "emailVerify", "company", "linkedin", "news", "social",
];

// ── Domaines jetables (E-02) — liste compacte des plus courants ──────────────
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "yopmail.com", "guerrillamail.com", "10minutemail.com",
  "tempmail.com", "trashmail.com", "getnada.com", "throwawaymail.com",
  "fakeinbox.com", "sharklasers.com", "maildrop.cc", "temp-mail.org",
  "dispostable.com", "mailnesia.com", "spambog.com", "mohmal.com",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function hasMx(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

// ── E-01 — Recherche automatique de l'email ─────────────────────────────────

export type EmailFinderResult = {
  found: string | null;
  candidates: string[];
  confidence: number; // 0-100
  source: "hunter" | "dropcontact" | "pattern" | "none";
  mxValid: boolean;
};

async function findEmail(args: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  domain: string | null;
  website: string | null;
}): Promise<EmailFinderResult> {
  const { firstName, lastName, domain } = args;
  if (!domain) {
    return { found: null, candidates: [], confidence: 0, source: "none", mxValid: false };
  }

  // Fournisseurs réels (INT-03), dans l'ordre : Hunter.io puis Dropcontact.
  const cfg = await getEnrichmentConfig();
  if (cfg.hunter.usable && cfg.hunter.apiKey && firstName && lastName) {
    const hit = await hunterFindEmail(cfg.hunter.apiKey, { domain, firstName, lastName });
    if (hit) return { found: hit.email, candidates: [hit.email], confidence: hit.confidence, source: "hunter", mxValid: await hasMx(domain) };
  }
  if (cfg.dropcontact.usable && cfg.dropcontact.apiKey) {
    const hit = await dropcontactFindEmail(cfg.dropcontact.apiKey, { firstName, lastName, company: args.company, website: args.website });
    if (hit) return { found: hit.email, candidates: [hit.email], confidence: hit.confidence, source: "dropcontact", mxValid: await hasMx(domain) };
  }

  // Stub : génération de patterns + validation MX du domaine.
  const fn = firstName ? slug(firstName) : "";
  const ln = lastName ? slug(lastName) : "";
  const candidates: string[] = [];
  if (fn && ln) {
    candidates.push(`${fn}.${ln}@${domain}`, `${fn}${ln}@${domain}`, `${fn[0]}${ln}@${domain}`, `${fn}@${domain}`);
  } else if (fn) {
    candidates.push(`${fn}@${domain}`);
  } else if (ln) {
    candidates.push(`${ln}@${domain}`);
  }
  candidates.push(`contact@${domain}`, `info@${domain}`);

  const mxValid = await hasMx(domain);
  const best = candidates[0] ?? null;
  // Confiance heuristique : pattern le plus courant + MX valide.
  const confidence = best && fn && ln ? (mxValid ? 55 : 25) : best ? (mxValid ? 30 : 10) : 0;

  return {
    found: best,
    candidates: Array.from(new Set(candidates)),
    confidence,
    source: best ? "pattern" : "none",
    mxValid,
  };
}

// ── E-02 — Vérification email ────────────────────────────────────────────────

export type EmailVerifyResult = {
  email: string | null;
  syntaxValid: boolean;
  mxFound: boolean;
  disposable: boolean;
  roleAccount: boolean;
  confidenceScore: number; // 0-100
  verdict: "valid" | "risky" | "invalid" | "unknown";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_PREFIXES = new Set(["contact", "info", "hello", "admin", "support", "sales", "no-reply", "noreply"]);

async function verifyEmail(email: string | null): Promise<EmailVerifyResult> {
  if (!email) {
    return { email, syntaxValid: false, mxFound: false, disposable: false, roleAccount: false, confidenceScore: 0, verdict: "unknown" };
  }
  const syntaxValid = EMAIL_RE.test(email);
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const disposable = DISPOSABLE_DOMAINS.has(domain);
  const roleAccount = ROLE_PREFIXES.has(local);
  const mxFound = syntaxValid && domain ? await hasMx(domain) : false;

  let score = 0;
  if (syntaxValid) score += 30;
  if (mxFound) score += 45;
  if (!disposable) score += 15;
  if (!roleAccount) score += 10;

  const verdict: EmailVerifyResult["verdict"] =
    !syntaxValid || !mxFound ? "invalid"
      : disposable ? "risky"
      : score >= 80 ? "valid"
      : "risky";

  return { email, syntaxValid, mxFound, disposable, roleAccount, confidenceScore: score, verdict };
}

// ── E-03 — Enrichissement entreprise (firmographie) ─────────────────────────

export type CompanyEnrichResult = {
  source: "pappers" | "recherche-entreprises" | "stub";
  legalName?: string | null;
  siren?: string | null;
  /** Ancien nom du champ (contenait le SIREN) — conservé pour les fiches déjà enrichies. */
  siret?: string | null;
  nafCode?: string | null;
  nafLabel?: string | null;
  employees?: number | null;
  employeesRange?: string | null;
  revenue?: string | null;
  foundedYear?: number | null;
  address?: string | null;
  active?: boolean | null;
  note?: string;
};

async function enrichCompany(args: {
  company: string | null;
  domain: string | null;
  country: string | null;
  /** SIREN lu dans les mentions légales du site (scraper) : recherche exacte. */
  siren: string | null;
}): Promise<CompanyEnrichResult> {
  const isFrench = (args.country ?? "France").toLowerCase().includes("france");
  if (!args.company && !args.siren) {
    return { source: "stub", legalName: null, note: "Aucune entreprise ni SIREN sur la fiche." };
  }
  const query = { company: args.company ?? args.siren ?? "", siren: args.siren };
  // Fournisseurs réels (INT-03), dans l'ordre : Pappers (clé) puis API Recherche d'entreprises (gratuite).
  const cfg = await getEnrichmentConfig();
  if (isFrench && cfg.pappers.usable && cfg.pappers.apiKey) {
    const hit = await pappersSearch(cfg.pappers.apiKey, query);
    if (hit) return { source: "pappers", ...hit, siret: hit.siren, employees: null, revenue: null };
  }
  if (isFrench && cfg["recherche-entreprises"].usable) {
    const hit = await rechercheEntreprisesSearch(query);
    if (hit) return { source: "recherche-entreprises", ...hit, siret: hit.siren, employees: null, revenue: null };
  }
  return {
    source: "stub",
    legalName: args.company ?? null,
    note: isFrench
      ? "Aucune entreprise correspondante trouvée (Pappers / Recherche d'entreprises) — vérifiez les fournisseurs dans Configuration › Enrichissement."
      : "Entreprise hors de France : pas de registre public interrogé.",
  };
}

// ── E-04 — Recherche profil LinkedIn ────────────────────────────────────────
// LinkedIn n'est jamais interrogé ni extrait (CGU). Priorité aux liens réellement publiés sur le site
// de l'entreprise (relevés par le scraper) : « vérifiés ». À défaut, URL déduite du nom : « suggestion
// non vérifiée ». Les profils de personnes vérifiés restent dans `contactsEnc` (chiffré) : ce bloc n'en
// garde que le nombre.

export type LinkedinLink = { url: string; status: "verified" | "unverified"; source: "site" | "pattern" };

export type LinkedinResult = {
  company: LinkedinLink | null;
  /** Suggestion de profil (nom + prénom) — uniquement si aucun profil n'a été trouvé sur le site. */
  profileGuess: LinkedinLink | null;
  /** Profils de personnes trouvés sur le site (détail chiffré dans contactsEnc.linkedinProfiles). */
  verifiedProfiles: number;
  /** Compatibilité avec les fiches enrichies avant E-04 (URL devinées). */
  profileUrlGuess: string | null;
  companyUrlGuess: string | null;
  source: "site" | "pattern" | "site+pattern";
  note: string;
};

function findLinkedin(args: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  enrichment: unknown;
  contacts: LeadPrivateContacts | null;
}): LinkedinResult {
  const site = siteLinkedinLinks(args.enrichment, args.contacts);
  const fn = args.firstName ? slug(args.firstName) : "";
  const ln = args.lastName ? slug(args.lastName) : "";
  const companyGuess = args.company ? `https://www.linkedin.com/company/${slug(args.company)}` : null;
  const profileGuess = fn && ln ? `https://www.linkedin.com/in/${fn}-${ln}` : null;

  const company: LinkedinLink | null = site.company[0]
    ? { url: site.company[0], status: "verified", source: "site" }
    : companyGuess ? { url: companyGuess, status: "unverified", source: "pattern" } : null;
  const guess: LinkedinLink | null = !site.people.length && profileGuess
    ? { url: profileGuess, status: "unverified", source: "pattern" }
    : null;
  const fromSite = site.company.length > 0 || site.people.length > 0;
  const fromPattern = company?.source === "pattern" || guess !== null;
  return {
    company,
    profileGuess: guess,
    verifiedProfiles: site.people.length,
    profileUrlGuess: guess?.url ?? null,
    companyUrlGuess: company?.source === "pattern" ? company.url : null,
    source: fromSite && fromPattern ? "site+pattern" : fromSite ? "site" : "pattern",
    note: fromSite
      ? "Liens publiés sur le site de l'entreprise (vérifiés). LinkedIn n'est pas interrogé."
      : "Aucun lien LinkedIn sur le site : URL déduites du nom (suggestions non vérifiées).",
  };
}

// ── E-05 — Veille actualité entreprise (Google News RSS, gratuit) ───────────

export type NewsItem = { title: string; url: string; source: string; date: string | null };
export type NewsResult = { items: NewsItem[]; source: "google_news" | "none" };

async function watchNews(company: string | null): Promise<NewsResult> {
  if (!company) return { items: [], source: "none" };
  try {
    const q = encodeURIComponent(`"${company}"`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 CRM-LeadDashboard" } });
    if (!res.ok) return { items: [], source: "none" };
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) && items.length < 5) {
      const block = m[1] ?? "";
      const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim() ?? "";
      const link = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1]?.trim() ?? "";
      const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block)?.[1]?.trim() ?? null;
      const src = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block)?.[1]?.trim() ?? "Google News";
      if (title && link) {
        items.push({
          title: title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
          url: link,
          source: src,
          date: pubDate ? new Date(pubDate).toISOString() : null,
        });
      }
    }
    return { items, source: items.length > 0 ? "google_news" : "none" };
  } catch {
    return { items: [], source: "none" };
  }
}

// ── E-06 — Détection des réseaux sociaux ────────────────────────────────────

export type SocialResult = {
  twitter: string | null;
  facebook: string | null;
  instagram: string | null;
  source: "pattern";
  note: string;
};

function findSocial(company: string | null): SocialResult {
  if (!company) {
    return { twitter: null, facebook: null, instagram: null, source: "pattern", note: "Aucune entreprise fournie." };
  }
  const handle = slug(company);
  return {
    twitter: `https://twitter.com/${handle}`,
    facebook: `https://www.facebook.com/${handle}`,
    instagram: `https://www.instagram.com/${handle}`,
    source: "pattern",
    note: "Handles déduits du nom de l'entreprise (non vérifiés).",
  };
}

// ── Orchestrateur ────────────────────────────────────────────────────────────

export type EnrichmentBlock = {
  email?: EmailFinderResult & { at: string };
  emailVerify?: EmailVerifyResult & { at: string };
  company?: CompanyEnrichResult & { at: string };
  linkedin?: LinkedinResult & { at: string };
  news?: NewsResult & { at: string };
  social?: SocialResult & { at: string };
  lastEnrichedAt?: string;
  providersRun?: EnrichProvider[];
};

export type EnrichLeadResult = {
  leadId: string;
  ran: EnrichProvider[];
  emailWritten: boolean;
  enrichment: EnrichmentBlock;
  /** E-07 — score avant / après le recalcul automatique. */
  score: { before: number; after: number | null };
};

/**
 * Enrichit un lead avec les providers demandés et fusionne dans Lead.enrichment.
 * Si E-01 trouve un email et que le lead n'en a pas, on le persiste (emailEnc +
 * emailHash) — utile pour la déduplication et l'emailing.
 */
export async function enrichLeadById(
  leadId: string,
  providers: EnrichProvider[] = ALL_PROVIDERS,
  opts: { userId?: string | null; weights?: ScoringWeights } = {},
): Promise<EnrichLeadResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.deletedAt) throw new Error("Lead introuvable");

  const now = new Date().toISOString();
  const existing = (lead.enrichment ?? {}) as EnrichmentBlock;
  const out: EnrichmentBlock = { ...existing };
  const ran: EnrichProvider[] = [];

  const currentEmail = decryptOrNull(lead.emailEnc);
  const domain = domainFromWebsite(lead.website) ?? (currentEmail ? currentEmail.split("@")[1] ?? null : null);

  let emailWritten = false;

  if (providers.includes("email")) {
    const r = await findEmail({
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      domain,
      website: lead.website,
    });
    out.email = { ...r, at: now };
    ran.push("email");
    // Persiste si lead sans email et candidat trouvé.
    if (!currentEmail && r.found) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { emailEnc: encryptOrNull(r.found), emailHash: emailHash(r.found) },
      });
      emailWritten = true;
    }
  }

  if (providers.includes("emailVerify")) {
    const target = emailWritten ? out.email?.found ?? null : currentEmail;
    const r = await verifyEmail(target);
    out.emailVerify = { ...r, at: now };
    ran.push("emailVerify");
    // Reflète le verdict sur Lead.emailStatus.
    if (target) {
      const emailStatus =
        r.verdict === "valid" ? "VALID"
          : r.verdict === "invalid" ? "HARD_BOUNCE"
          : lead.emailStatus;
      if (emailStatus !== lead.emailStatus) {
        await prisma.lead.update({ where: { id: leadId }, data: { emailStatus } });
      }
    }
  }

  if (providers.includes("company")) {
    const siren = ((existing as { siteContacts?: { legal?: { siren?: unknown } | null } }).siteContacts?.legal?.siren);
    out.company = {
      ...(await enrichCompany({ company: lead.company, domain, country: lead.country, siren: typeof siren === "string" ? siren : null })),
      at: now,
    };
    ran.push("company");
  }
  if (providers.includes("linkedin")) {
    out.linkedin = {
      ...findLinkedin({
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        enrichment: existing,
        contacts: parseContacts(decryptOrNull(lead.contactsEnc)),
      }),
      at: now,
    };
    ran.push("linkedin");
  }
  if (providers.includes("news")) {
    out.news = { ...(await watchNews(lead.company)), at: now };
    ran.push("news");
  }
  if (providers.includes("social")) {
    out.social = { ...findSocial(lead.company), at: now };
    ran.push("social");
  }

  out.lastEnrichedAt = now;
  out.providersRun = Array.from(new Set([...(existing.providersRun ?? []), ...ran]));

  await prisma.lead.update({
    where: { id: leadId },
    data: { enrichment: out as object, lastActionAt: new Date() },
  });
  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: opts.userId ?? null,
      type: "enriched",
      payload: { providers: ran, emailWritten } as object,
    },
  });

  // E-07 — scoring automatique post-enrichissement (formule partagée @crm/db, poids de l'administration).
  const after = await recomputeLeadScore(prisma, leadId, opts.weights);
  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: opts.userId ?? null,
      type: "recalc_score",
      payload: { score: after, from: lead.score, trigger: "enrichment", providers: ran } as object,
    },
  });

  return { leadId, ran, emailWritten, enrichment: out, score: { before: lead.score, after } };
}

function parseContacts(json: string | null): LeadPrivateContacts | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LeadPrivateContacts;
  } catch {
    return null;
  }
}

export async function enrichmentProvidersStatus() {
  const cfg = await getEnrichmentConfig();
  const email = [cfg.hunter.usable && "hunter (API)", cfg.dropcontact.usable && "dropcontact (API)"].filter(Boolean);
  const company = [cfg.pappers.usable && "pappers (API)", cfg["recherche-entreprises"].usable && "recherche-entreprises (API publique)"].filter(Boolean);
  return {
    email: email.length ? `${email.join(" → ")} → pattern + MX` : "pattern + MX (stub)",
    emailVerify: "MX + disposables + heuristique (gratuit)",
    company: company.length ? company.join(" → ") : "stub",
    linkedin: "liens publiés sur le site (vérifiés) → pattern (suggestion)",
    news: "Google News RSS (gratuit)",
    social: "pattern (heuristique)",
  };
}
