/**
 * @crm/jobs — tâches de fond du CRM (campagnes, IMAP, séquences, scraping, imports, scoring).
 * Démarrées par le serveur Next.js (apps/web/instrumentation.ts) ou par src/standalone.ts.
 */
export { startJobs } from "./start";
export { handlers } from "./handlers";
export { buildLeadCreateFromScraped, scrapedNotes } from "./scraping/leadPayload";
export { isScrapedLeadDuplicateInCrm } from "./scraping/dedup";
// AN-05 — rapports d'analytique (agrégations partagées avec l'API web, PDF, envoi planifié).
export * from "./reports/analyticsData";
export {
  buildAnalyticsReport, rowsForReport, rowsToCsv, reportSheets, REPORT_KEYS, PERIOD_LABEL,
  type AnalyticsReport, type ReportKey, type Row as ReportRow,
} from "./reports/rows";
export { renderAnalyticsPdf } from "./reports/pdf";
export { computeNextRun, describePlan, reportWorkbook, type ReportFrequency } from "./reports/schedule";
