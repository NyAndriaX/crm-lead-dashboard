/**
 * Engine d'enrichissement de leads (module Enrichissement E-01 → E-09).
 *
 * Principe "dry-run / stub-first" : chaque provider fonctionne SANS clé API
 * (heuristiques + ressources gratuites : DNS MX, RSS Google News, patterns
 * d'URL). Si une clé API est fournie en env (HUNTER_API_KEY, PAPPERS_API_KEY,
 * …), le provider bascule automatiquement sur la source réelle.
 *
 * Le résultat est fusionné dans `Lead.enrichment` (champ Json) avec, pour
 * chaque bloc, la `source` et la date — exigence E-09 (traçabilité).
 */
import dns from "node:dns/promises";
import { prisma } from "@crm/db";
import { decryptOrNull, encryptOrNull, emailHash } from "@/lib/crypto";

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
  source: "hunter" | "pattern" | "none";
  mxValid: boolean;
};

async function findEmail(args: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  domain: string | null;
}): Promise<EmailFinderResult> {
  const { firstName, lastName, domain } = args;
  if (!domain) {
    return { found: null, candidates: [], confidence: 0, source: "none", mxValid: false };
  }

  // Provider réel si clé Hunter présente.
  const hunterKey = process.env.HUNTER_API_KEY?.trim();
  if (hunterKey && firstName && lastName) {
    try {
      const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${hunterKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { data?: { email?: string; score?: number } };
        if (j.data?.email) {
          return {
            found: j.data.email,
            candidates: [j.data.email],
            confidence: j.data.score ?? 70,
            source: "hunter",
            mxValid: await hasMx(domain),
          };
        }
      }
    } catch {
      /* fallback pattern */
    }
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
  source: "pappers" | "stub";
  legalName?: string | null;
  siret?: string | null;
  nafCode?: string | null;
  employees?: number | null;
  revenue?: string | null;
  foundedYear?: number | null;
  note?: string;
};

async function enrichCompany(args: {
  company: string | null;
  domain: string | null;
  country: string | null;
}): Promise<CompanyEnrichResult> {
  const pappersKey = process.env.PAPPERS_API_KEY?.trim();
  if (pappersKey && args.company && (args.country ?? "France").toLowerCase().includes("france")) {
    try {
      const url = `https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(args.company)}&api_token=${pappersKey}&par_page=1`;
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as {
          resultats?: Array<{
            nom_entreprise?: string; siren?: string; code_naf?: string;
            tranche_effectif?: string; date_creation?: string;
          }>;
        };
        const r = j.resultats?.[0];
        if (r) {
          return {
            source: "pappers",
            legalName: r.nom_entreprise ?? null,
            siret: r.siren ?? null,
            nafCode: r.code_naf ?? null,
            employees: null,
            revenue: null,
            foundedYear: r.date_creation ? Number(r.date_creation.slice(0, 4)) : null,
          };
        }
      }
    } catch {
      /* fallback stub */
    }
  }
  return {
    source: "stub",
    legalName: args.company ?? null,
    note: "Configurez PAPPERS_API_KEY (entreprises FR) ou CLEARBIT_API_KEY pour des données firmographiques réelles.",
  };
}

// ── E-04 — Recherche profil LinkedIn ────────────────────────────────────────

export type LinkedinResult = {
  profileUrlGuess: string | null;
  companyUrlGuess: string | null;
  source: "pattern";
  note: string;
};

function findLinkedin(args: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}): LinkedinResult {
  const fn = args.firstName ? slug(args.firstName) : "";
  const ln = args.lastName ? slug(args.lastName) : "";
  const profileUrlGuess = fn && ln ? `https://www.linkedin.com/in/${fn}-${ln}` : null;
  const companyUrlGuess = args.company
    ? `https://www.linkedin.com/company/${slug(args.company)}`
    : null;
  return {
    profileUrlGuess,
    companyUrlGuess,
    source: "pattern",
    note: "URLs déduites par heuristique (non vérifiées). L'API LinkedIn officielle est restreinte ; intégration Sales Navigator hors périmètre.",
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
};

/**
 * Enrichit un lead avec les providers demandés et fusionne dans Lead.enrichment.
 * Si E-01 trouve un email et que le lead n'en a pas, on le persiste (emailEnc +
 * emailHash) — utile pour la déduplication et l'emailing.
 */
export async function enrichLeadById(
  leadId: string,
  providers: EnrichProvider[] = ALL_PROVIDERS,
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
    out.company = { ...(await enrichCompany({ company: lead.company, domain, country: lead.country })), at: now };
    ran.push("company");
  }
  if (providers.includes("linkedin")) {
    out.linkedin = { ...findLinkedin({ firstName: lead.firstName, lastName: lead.lastName, company: lead.company }), at: now };
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
      type: "enriched",
      payload: { providers: ran, emailWritten } as object,
    },
  });

  return { leadId, ran, emailWritten, enrichment: out };
}

export function enrichmentProvidersStatus() {
  return {
    email: process.env.HUNTER_API_KEY ? "hunter (API)" : "pattern + MX (stub)",
    emailVerify: "MX + disposables + heuristique (gratuit)",
    company: process.env.PAPPERS_API_KEY ? "pappers (API)" : "stub",
    linkedin: "pattern (heuristique)",
    news: "Google News RSS (gratuit)",
    social: "pattern (heuristique)",
  };
}
