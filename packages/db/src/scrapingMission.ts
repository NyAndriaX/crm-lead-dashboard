/**
 * Configuration des missions scraping — alignée sur l'API apps/scraper (POST /scrape).
 */
import type { ScrapedLead, ScrapeSource } from "./scraping";

export type ScheduleMode = "manual" | "once" | "recurring";
export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type MissionSchedulePlan = {
  mode: ScheduleMode;
  /** ISO 8601 — exécution ponctuelle ou première exécution récurrente. */
  runAt?: string | null;
  frequency?: ScheduleFrequency | null;
  lastRunAt?: string | null;
};

export type MissionConfig = {
  keywords: string;
  /** Description de la cible en langage naturel (assistant IA, skill crm-scraping-plan). */
  brief?: string | null;
  /** Requêtes Maps « métier + zone » générées par le plan IA (prioritaires sur keywords/city). */
  queries?: string[];
  /** Profil cible transmis au scraper pour le score d'adéquation (skill crm-lead-analysis). */
  targetProfile?: string | null;
  /** Leads analysés dont le score d'adéquation est inférieur → rejetés automatiquement. */
  minFitScore?: number | null;
  location: {
    city?: string | null;
    country?: string | null;
    radiusKm?: number | null;
  };
  limit: number;
  detailed: boolean;
  locale: string;
  filter_country: boolean;
  /** Si true, les leads sans email sont exclus des résultats (non enregistrés). */
  requireEmail: boolean;
  /** Toujours google_maps en mode LIVE ; conservé pour sandbox legacy. */
  sources: ScrapeSource[];
  /**
   * Pages de sites sectoriels (annuaires de branche, listes de membres de fédérations) visitées
   * en plus de Google Maps ; leurs établissements suivent le même pipeline (S-05).
   */
  sectorSites?: string[];
  /** Débit de la mission (S-06), transmis au scraper ; sans valeur → configuration du scraper. */
  rate: {
    delayMs: number;
    retries: number;
    rotateUserAgent: boolean;
    /** Proxy sans identifiants (en clair), ou libellé masqué (`http://user:***@hôte:port`) s'il en contient. */
    proxyUrl?: string | null;
    /** Proxy avec identifiants : URL chiffrée AES-256-GCM (base64), déchiffrée par le worker seulement. */
    proxyUrlEnc?: string | null;
  };
  dailyQuota?: number | null;
  autoPipeline?: {
    enabled: boolean;
    sequenceId?: string | null;
  };
  schedulePlan?: MissionSchedulePlan;
};

export const DEFAULT_MISSION_RATE: MissionConfig["rate"] = {
  delayMs: 2000,
  retries: 2,
  rotateUserAgent: true,
  proxyUrl: null,
  proxyUrlEnc: null,
};

export const MAX_SECTOR_SITES = 10;
const PROXY_MASK = "***";

/** URL de proxy avec identifiants (`user:pass@`) → à stocker chiffrée. */
export function proxyHasCredentials(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.includes("://") ? url : `http://${url}`);
    return Boolean(u.username || u.password);
  } catch {
    return false;
  }
}

/** Libellé affichable d'un proxy : le mot de passe n'apparaît jamais. */
export function maskProxyUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.includes("://") ? url : `http://${url}`);
    if (!u.username && !u.password) return `${u.protocol}//${u.host}`;
    return `${u.protocol}//${decodeURIComponent(u.username)}:${PROXY_MASK}@${u.host}`;
  } catch {
    return null;
  }
}

/** Valeur renvoyée telle quelle par le formulaire (libellé masqué) : conserver le proxy chiffré existant. */
export function isMaskedProxy(url: string | null | undefined): boolean {
  return Boolean(url && url.includes(`:${PROXY_MASK}@`));
}

function normalizeRate(raw: unknown): MissionConfig["rate"] {
  const r = (raw ?? {}) as Partial<MissionConfig["rate"]>;
  const num = (v: unknown, def: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(Math.round(v), max)) : def;
  const proxyUrl = typeof r.proxyUrl === "string" && r.proxyUrl.trim() ? r.proxyUrl.trim().slice(0, 500) : null;
  const proxyUrlEnc = typeof r.proxyUrlEnc === "string" && r.proxyUrlEnc ? r.proxyUrlEnc : null;
  return {
    delayMs: num(r.delayMs, DEFAULT_MISSION_RATE.delayMs, 60_000),
    retries: num(r.retries, DEFAULT_MISSION_RATE.retries, 5),
    rotateUserAgent: r.rotateUserAgent !== false,
    // Jamais d'identifiants en clair dans la configuration : seulement un libellé masqué.
    proxyUrl: proxyUrl && proxyHasCredentials(proxyUrl) ? maskProxyUrl(proxyUrl) : proxyUrl,
    proxyUrlEnc,
  };
}

/** URL http(s) valides, sans doublon, au plus MAX_SECTOR_SITES. */
export function normalizeSectorSites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    try {
      const u = new URL(v.trim());
      if ((u.protocol === "http:" || u.protocol === "https:") && !out.includes(u.toString())) out.push(u.toString());
    } catch {
      /* URL invalide ignorée */
    }
    if (out.length >= MAX_SECTOR_SITES) break;
  }
  return out;
}

const LOCALE_MAP: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
};

export function localeToScraper(locale?: string | null, language?: string | null): string {
  const raw = (locale ?? language ?? "fr-FR").trim();
  if (raw.includes("-")) return raw;
  return LOCALE_MAP[raw.toLowerCase()] ?? "fr-FR";
}

export function normalizeMissionConfig(raw: unknown): MissionConfig {
  const c = (raw ?? {}) as Partial<MissionConfig> & {
    language?: string | null;
    companyType?: string | null;
    schedule?: unknown;
  };

  let schedulePlan = c.schedulePlan as MissionSchedulePlan | undefined;
  if (!schedulePlan && typeof (c as { schedule?: string }).schedule === "string") {
    const legacy = (c as { schedule?: string }).schedule;
    if (legacy === "daily" || legacy === "weekly" || legacy === "monthly") {
      schedulePlan = { mode: "recurring", frequency: legacy };
    }
  }
  if (!schedulePlan) {
    schedulePlan = { mode: "manual" };
  }
  if (!schedulePlan.mode) schedulePlan.mode = "manual";

  const queries = Array.isArray(c.queries)
    ? c.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 1).map((q) => q.trim()).slice(0, 8)
    : [];
  const minFit = typeof c.minFitScore === "number" ? Math.max(0, Math.min(100, Math.round(c.minFitScore))) : null;

  return {
    keywords: typeof c.keywords === "string" ? c.keywords : "",
    brief: typeof c.brief === "string" && c.brief.trim() ? c.brief.trim().slice(0, 2000) : null,
    queries,
    targetProfile:
      typeof c.targetProfile === "string" && c.targetProfile.trim() ? c.targetProfile.trim().slice(0, 2000) : null,
    minFitScore: minFit,
    location: {
      city: c.location?.city ?? null,
      country: c.location?.country ?? "France",
      radiusKm: c.location?.radiusKm ?? null,
    },
    limit: typeof c.limit === "number" && c.limit > 0 ? Math.min(c.limit, 120) : 20,
    detailed: c.detailed !== false,
    locale: localeToScraper(c.locale, c.language),
    filter_country: c.filter_country !== false,
    requireEmail: c.requireEmail !== false,
    sources: ["google_maps"],
    sectorSites: normalizeSectorSites(c.sectorSites),
    rate: normalizeRate(c.rate),
    dailyQuota:
      typeof c.dailyQuota === "number" && c.dailyQuota > 0 ? Math.min(c.dailyQuota, 1000) : null,
    autoPipeline: c.autoPipeline?.enabled
      ? { enabled: true, sequenceId: c.autoPipeline.sequenceId ?? null }
      : { enabled: false, sequenceId: null },
    schedulePlan,
  };
}

/**
 * Corps JSON pour POST /scrape (apps/scraper).
 * `proxyUrl` : proxy déchiffré par le worker (sinon celui de la config s'il est en clair).
 */
export function toScraperRequestBody(
  cfg: MissionConfig,
  opts: { proxyUrl?: string | null } = {},
): Record<string, unknown> {
  const plainProxy = cfg.rate.proxyUrlEnc || isMaskedProxy(cfg.rate.proxyUrl) ? null : cfg.rate.proxyUrl ?? null;
  return {
    keywords: cfg.keywords.trim() || cfg.queries?.[0] || "entreprise",
    queries: cfg.queries && cfg.queries.length > 0 ? cfg.queries : null,
    target: cfg.targetProfile ?? null,
    location: {
      city: cfg.location.city ?? null,
      country: cfg.location.country ?? "France",
      radiusKm: cfg.location.radiusKm ?? null,
    },
    limit: cfg.limit,
    detailed: cfg.detailed,
    locale: cfg.locale,
    filter_country: cfg.filter_country,
    sectorSites: cfg.sectorSites && cfg.sectorSites.length > 0 ? cfg.sectorSites : null,
    rate: {
      delayMs: cfg.rate.delayMs,
      retries: cfg.rate.retries,
      rotateUserAgent: cfg.rate.rotateUserAgent,
      proxyUrl: opts.proxyUrl ?? plainProxy,
    },
  };
}

export function leadHasEmail(lead: Pick<ScrapedLead, "email">): boolean {
  const e = lead.email?.trim().toLowerCase();
  return !!e && e.includes("@");
}

export function passesEmailRequirement(
  lead: Pick<ScrapedLead, "email" | "email_status">,
  requireEmail: boolean,
): boolean {
  if (!requireEmail) return true;
  return leadHasEmail(lead);
}

const MS_DAY = 86_400_000;

export function shouldRunScheduledMission(
  plan: MissionSchedulePlan | undefined,
  status: string,
): boolean {
  if (!plan || plan.mode === "manual") return false;
  if (status === "running" || status === "queued") return false;
  // Une mission ponctuelle ("once") déjà terminée ne doit pas être re-déclenchée.
  if (plan.mode === "once" && status === "done") return false;

  const now = Date.now();
  const lastRun = plan.lastRunAt ? new Date(plan.lastRunAt).getTime() : null;

  if (plan.mode === "once") {
    if (lastRun) return false;
    const runAt = plan.runAt ? new Date(plan.runAt).getTime() : 0;
    return runAt > 0 && now >= runAt;
  }

  if (plan.mode === "recurring") {
    const freq = plan.frequency ?? "daily";
    const intervalMs =
      freq === "monthly" ? 30 * MS_DAY : freq === "weekly" ? 7 * MS_DAY : MS_DAY;
    if (!lastRun) {
      const anchor = plan.runAt ? new Date(plan.runAt).getTime() : 0;
      return anchor === 0 || now >= anchor;
    }
    return now - lastRun >= intervalMs;
  }

  return false;
}

export function scheduleLabel(plan?: MissionSchedulePlan): string {
  if (!plan || plan.mode === "manual") return "Manuel";
  if (plan.mode === "once") {
    return plan.runAt
      ? `Ponctuel — ${new Date(plan.runAt).toLocaleString("fr-FR")}`
      : "Ponctuel";
  }
  const f =
    plan.frequency === "weekly"
      ? "Hebdomadaire"
      : plan.frequency === "monthly"
        ? "Mensuel"
        : "Quotidien";
  return `Récurrent — ${f}`;
}
