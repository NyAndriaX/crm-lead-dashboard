/**
 * Configuration des missions scraping — alignée sur l'API crm-leads-scraper.
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
  rate: {
    delayMs: number;
    retries: number;
    rotateUserAgent: boolean;
    proxyUrl?: string | null;
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
};

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

  return {
    keywords: typeof c.keywords === "string" ? c.keywords : "",
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
    rate: { ...DEFAULT_MISSION_RATE, ...(c.rate ?? {}) },
    dailyQuota:
      typeof c.dailyQuota === "number" && c.dailyQuota > 0 ? Math.min(c.dailyQuota, 1000) : null,
    autoPipeline: c.autoPipeline?.enabled
      ? { enabled: true, sequenceId: c.autoPipeline.sequenceId ?? null }
      : { enabled: false, sequenceId: null },
    schedulePlan,
  };
}

/** Corps JSON pour POST /scrape (crm-leads-scraper). */
export function toScraperRequestBody(cfg: MissionConfig): Record<string, unknown> {
  return {
    keywords: cfg.keywords.trim() || "entreprise",
    location: {
      city: cfg.location.city ?? null,
      country: cfg.location.country ?? "France",
      radiusKm: cfg.location.radiusKm ?? null,
    },
    limit: cfg.limit,
    detailed: cfg.detailed,
    locale: cfg.locale,
    filter_country: cfg.filter_country,
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
