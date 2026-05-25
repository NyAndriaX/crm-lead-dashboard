import { PrismaClient } from "@prisma/client";

// Client Prisma partagé (web + worker). Singleton en dev pour éviter
// l'épuisement des connexions lors du hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";

/** Cast sûr d'un champ Prisma Json (ex. tags, variables, events) vers string[]. */
export function asStringArray(val: unknown): string[] {
  return Array.isArray(val) ? (val as string[]) : [];
}
export { LEAD_NOT_DELETED, buildLeadWhereFromSegmentFilters, type LeadSegmentFilters } from "./leadWhere";
export { signEmailTrackToken, verifyEmailTrackToken, type EmailTrackKind, type EmailTrackPayload } from "./emailTrack";
export {
  parseScraperPayload,
  resolveCompany,
  resolveContactNames,
  namesFromEmail,
  isIdentifiableLead,
  scraperEnrichment,
  tagsFromScrapedLead,
  placeIdTag,
  type ScrapedLead,
  type ScraperApiResponse,
  type ScrapeSource,
  type ScrapeConfig,
  type ScrapedLeadEmailStatus,
} from "./scraping";
export {
  normalizeMissionConfig,
  toScraperRequestBody,
  leadHasEmail,
  passesEmailRequirement,
  shouldRunScheduledMission,
  scheduleLabel,
  localeToScraper,
  DEFAULT_MISSION_RATE,
  type MissionConfig,
  type MissionSchedulePlan,
  type ScheduleMode,
  type ScheduleFrequency,
} from "./scrapingMission";
