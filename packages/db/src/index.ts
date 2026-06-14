export { prisma } from "./client";
export { formatPrismaError, type FormattedPrismaError } from "./formatPrismaError";
export * from "@prisma/client";
export {
  type DataScope,
  DataScopeError,
  isAdminRole,
  ownedByUser,
  createdByUser,
  strictOwnerWhere,
  strictCreatorWhere,
  buildOwnerOrAssigneeLeadWhere,
  buildLeadVisibilityWhere,
  assertLeadAccess,
  resolvePipelineOwnerId,
  buildPipelineLeadsWhere,
  ensureDefaultPipelineStages,
  listNonAdminUsersForPipeline,
} from "./dataScope";
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
  getOpenAiUsageSummaryOrg,
  getOpenAiUsageSummaryForDashboard,
  type OpenAiUsageFeature,
  type OpenAiUsageSummary,
} from "./openaiUsage";
export { estimateOpenAiCostUsd, formatCostUsd, getModelPricing } from "./openaiPricing";
export { syncTags } from "./tags";
export {
  getOpenAiKnowledgeContext,
  injectKnowledgeIntoMessages,
  parseKnowledgeDocs,
  normalizeKnowledgeDocs,
  type AiKnowledgeDoc,
} from "./openaiKnowledge";
export {
  getCampaignKnowledgeContext,
  injectCampaignKnowledgeIntoMessages,
  parseCampaignKnowledgeFromConfig,
  type CampaignKnowledgeConfig,
} from "./campaignKnowledge";
export {
  getSequenceKnowledgeContext,
  injectSequenceKnowledgeIntoMessages,
  parseSequenceKnowledgeFromConfig,
  type SequenceKnowledgeConfig,
} from "./sequenceKnowledge";
export {
  listKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBaseContext,
  injectKnowledgeBaseIntoMessages,
  type KnowledgeBaseItem,
} from "./knowledgeBase";
export { buildSmtpNodemailerAuth, type SmtpAuthRow } from "./smtpTransport";
export {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendWebPushToUser,
} from "./webPush";
export { encrypt, decrypt, encryptOrNull, decryptOrNull, emailHash } from "./piiCrypto";
export {
  getUploadDir,
  PRODUCTION_UPLOAD_DIR,
} from "./uploadPaths";
export {
  processImportJob,
  resolveImportFilePath,
  type ImportProcessOptions,
} from "./importProcess";
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
