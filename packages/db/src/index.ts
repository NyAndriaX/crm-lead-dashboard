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
export { asStringArray } from "./json";
export { LEAD_NOT_DELETED, buildLeadWhereFromSegmentFilters, type LeadSegmentFilters } from "./leadWhere";
export { signEmailTrackToken, verifyEmailTrackToken, type EmailTrackKind, type EmailTrackPayload } from "./emailTrack";
export {
  parseScraperPayload,
  resolveCompany,
  resolveContactNames,
  namesFromEmail,
  isIdentifiableLead,
  scraperEnrichment,
  scrapedFitScore,
  scrapedPrivateContacts,
  type LeadPrivateContacts,
  type ScrapedLeadContacts,
  type ScrapedPhone,
  tagsFromScrapedLead,
  cleanWebsiteUrl,
  type ScrapedLead,
  type ScrapedLeadAI,
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
  MAX_SECTOR_SITES,
  isMaskedProxy,
  maskProxyUrl,
  normalizeSectorSites,
  proxyHasCredentials,
  type MissionConfig,
  type MissionSchedulePlan,
  type ScheduleMode,
  type ScheduleFrequency,
} from "./scrapingMission";
export { classifyLinkedinUrl, canonicalLinkedinUrl, siteLinkedinLinks, type LinkedinKind } from "./linkedin";
export {
  EMAIL_FORMAT,
  IMPORT_FIELD_LABELS,
  checkEmail,
  checkImportRow,
  checkPhone,
  checkWebsite,
  defaultRequiredFields,
  normalizeFrPhone,
  roundRobinAssignee,
  type FieldCheck,
  type ImportIssue,
  type ImportRowCheck,
  type ImportRowField,
  type ImportRowValues,
} from "./leadValidation";
export {
  DEFAULT_SCORING_WEIGHTS,
  aiPotentialOf,
  computeLeadScore,
  loadScoringWeights,
  recomputeLeadScore,
  type ScoringWeights,
  type ScoringSignals,
} from "./scoring";
export {
  AB_RULES,
  aggregateAbVariants,
  abVerdict,
  twoProportionZ,
  type AbEvent,
  type AbMetric,
  type AbRules,
  type AbVariant,
  type AbVariantStats,
  type AbVerdict,
} from "./abTest";
