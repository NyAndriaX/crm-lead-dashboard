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
  getAutoResponderSettings,
  resolveAutoResponderUserId,
  normalizeAutoResponderMode,
  DEFAULT_AUTO_RESPONDER_MEETING_URL,
  type AutoResponderMode,
  type AutoResponderSettings,
} from "./autoResponderConfig";
export {
  recordOpenAiUsage,
  getOpenAiUsageSummary,
  type OpenAiUsageFeature,
  type OpenAiUsageSummary,
} from "./openaiUsage";
export { estimateOpenAiCostUsd, formatCostUsd, getModelPricing } from "./openaiPricing";
export {
  getOpenAiKnowledgeContext,
  injectKnowledgeIntoMessages,
  parseKnowledgeDocs,
  normalizeKnowledgeDocs,
  type AiKnowledgeDoc,
} from "./openaiKnowledge";
export { encrypt, decrypt, encryptOrNull, decryptOrNull } from "./piiCrypto";
export {
  sendTransactionalEmail,
  TransactionalEmailError,
  escapeHtml,
} from "./transactionalEmail";
export {
  notifyUser,
  notificationEmailTemplate,
  type NotifyUserInput,
  type NotifyUserResult,
} from "./notifications";
export {
  getRbacMatrix,
  saveRbacMatrix,
  matrixToSets,
  DEFAULT_MATRIX,
  ALL_PERMISSIONS,
  PERMISSION_META,
  ROLE_LABELS as RBAC_ROLE_LABELS,
  ROLES as RBAC_ROLES,
  type Permission,
} from "./rbacConfig";
export {
  isEmailHashBlocked,
  blockEmailHash,
  gdprBlockMessage,
  GDPR_ERASE_REASON,
} from "./emailBlocklist";
export {
  getAccessToken,
  startDeviceCodeFlow,
  pollDeviceCodeToken,
  encryptToken,
  decryptToken,
  MS_OAUTH_SCOPES,
  type MsOAuthConfig,
  type MsTokenResponse,
  type DeviceCodeResponse,
} from "./microsoftOAuth";

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
