/**
 * Service Analytics (AN-01 → AN-05) — les agrégations vivent dans `@crm/jobs`
 * (packages/jobs/src/reports/analyticsData.ts) car elles servent aussi au job d'envoi planifié
 * des rapports par email. Ce module les ré-exporte pour les Route Handlers.
 */
export {
  periodToDateRange,
  getGlobalKpis,
  listCampaignReports,
  getLeadsTimeline,
  getSalesPerformance,
  type Period,
  type Granularity,
  type GlobalKpis,
  type CampaignReportRow,
  type TimelineBucket,
  type SalesPerfRow,
} from "@crm/jobs";
