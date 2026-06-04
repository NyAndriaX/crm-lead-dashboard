export { prisma } from "./client";
export * from "@prisma/client";
export {
  DEFAULT_OPENAI_MODEL,
  getOpenAiConfigPublic,
  resolveOpenAiCredentials,
  type OpenAiConfigPublic,
  type OpenAiCredentials,
} from "./openaiConfig";
export { openAiChatCompletion, type OpenAiMessage } from "./openaiChat";
export {
  recordOpenAiUsage,
  getOpenAiUsageSummary,
  type OpenAiUsageFeature,
  type OpenAiUsageSummary,
} from "./openaiUsage";
export { encrypt, decrypt, encryptOrNull, decryptOrNull } from "./piiCrypto";

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
