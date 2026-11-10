/**
 * AN-05 — Données d'un rapport d'analytique : lignes tabulaires (exports CSV / XLSX) et rapport
 * complet (export PDF, envoi planifié par email). Partagé par l'API web et le job `report-schedule-tick`.
 */
import {
  getGlobalKpis, getLeadsTimeline, getSalesPerformance, listCampaignReports,
  type CampaignReportRow, type GlobalKpis, type Granularity, type Period, type SalesPerfRow, type TimelineBucket,
} from "./analyticsData";

export type ReportKey = "global" | "campaigns" | "leads-timeline" | "sales-performance";
export const REPORT_KEYS: ReportKey[] = ["global", "campaigns", "leads-timeline", "sales-performance"];

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "90 derniers jours",
  ytd: "depuis le 1er janvier",
  all: "depuis le début",
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon", SCHEDULED: "Planifiée", SENDING: "En cours", PAUSED: "En pause", DONE: "Terminée", CANCELLED: "Annulée",
};

export type Row = Record<string, string | number | null | undefined>;

const pct = (v: number | null): string => (v != null ? `${v}%` : "—");

export type AnalyticsReport = {
  generatedAt: Date;
  period: Period;
  granularity: Granularity;
  kpis: GlobalKpis;
  campaigns: CampaignReportRow[];
  timeline: { buckets: TimelineBucket[]; sources: string[] };
  sales: SalesPerfRow[];
};

/** Rapport complet (toutes les sections) pour une période. */
export async function buildAnalyticsReport(period: Period, granularity: Granularity = "week"): Promise<AnalyticsReport> {
  const [kpis, campaigns, timeline, sales] = await Promise.all([
    getGlobalKpis(period),
    listCampaignReports(),
    getLeadsTimeline({ period, granularity }),
    getSalesPerformance(period),
  ]);
  return { generatedAt: new Date(), period, granularity, kpis, campaigns, timeline, sales };
}

export function kpiRows(k: GlobalKpis): Row[] {
  return [
    { Indicateur: "Période", Valeur: k.period },
    { Indicateur: "Leads (total)", Valeur: k.leadsTotal },
    { Indicateur: "Leads actifs", Valeur: k.leadsActive },
    { Indicateur: "Leads créés sur la période", Valeur: k.leadsCreated },
    { Indicateur: "Emails envoyés", Valeur: k.emailsSent },
    { Indicateur: "Taux d'ouverture", Valeur: pct(k.openRate) },
    { Indicateur: "Taux de clic", Valeur: pct(k.clickRate) },
    { Indicateur: "Taux de réponse", Valeur: pct(k.replyRate) },
    { Indicateur: "Taux de bounce", Valeur: pct(k.bounceRate) },
    { Indicateur: "Taux de désabonnement", Valeur: pct(k.unsubscribeRate) },
    { Indicateur: "Taux de conversion", Valeur: pct(k.conversionRate) },
    { Indicateur: "Réponses reçues (inbox)", Valeur: k.inboxMessagesReceived },
    { Indicateur: "Campagnes actives", Valeur: k.campaignsActive },
  ];
}

export function campaignRows(rows: CampaignReportRow[]): Row[] {
  return rows.map((r) => ({
    Nom: r.name,
    Statut: r.status,
    "Créée le": r.createdAt.toISOString().slice(0, 10),
    "Planifiée le": r.scheduledAt ? r.scheduledAt.toISOString().slice(0, 16).replace("T", " ") : "—",
    Envoyés: r.sent,
    Délivrés: r.delivered,
    Ouvertures: r.opens,
    Clics: r.clicks,
    Bounces: r.bounces,
    Désabos: r.unsubs,
    Réponses: r.replies,
    "Taux ouv.": pct(r.openRate),
    "Taux clic": pct(r.clickRate),
    CTOR: pct(r.ctorRate),
    "Taux réponse": pct(r.replyRate),
  }));
}

export function timelineRows(t: { buckets: TimelineBucket[]; sources: string[] }): Row[] {
  return t.buckets.map((b) => {
    const out: Row = { Période: b.period, Total: b.total };
    for (const src of t.sources) out[src] = b.bySource[src] ?? 0;
    return out;
  });
}

export function salesRows(rows: SalesPerfRow[]): Row[] {
  return rows.map((r) => ({
    Commercial: r.userName,
    Email: r.userEmail,
    "Leads assignés": r.leadsAssigned,
    Contactés: r.leadsContacted,
    Qualifiés: r.leadsQualified,
    Convertis: r.leadsConverted,
    Perdus: r.leadsLost,
    "Taux conversion": pct(r.conversionRate),
    "Score moyen": r.avgScore ?? "—",
    "Réponses reçues": r.repliesReceived,
  }));
}

export const SHEET_NAME: Record<ReportKey, string> = {
  global: "KPIs Globaux",
  campaigns: "Campagnes",
  "leads-timeline": "Évolution Leads",
  "sales-performance": "Performance commerciale",
};

/** Lignes d'un rapport (une feuille XLSX / un fichier CSV). */
export async function rowsForReport(args: { report: ReportKey; period: Period; granularity: Granularity }): Promise<{ rows: Row[]; sheetName: string }> {
  const sheetName = SHEET_NAME[args.report];
  switch (args.report) {
    case "global":
      return { sheetName, rows: kpiRows(await getGlobalKpis(args.period)) };
    case "campaigns":
      return { sheetName, rows: campaignRows(await listCampaignReports()) };
    case "leads-timeline":
      return { sheetName, rows: timelineRows(await getLeadsTimeline({ period: args.period, granularity: args.granularity })) };
    case "sales-performance":
      return { sheetName, rows: salesRows(await getSalesPerformance(args.period)) };
  }
}

/** Toutes les feuilles d'un rapport complet (classeur XLSX joint à l'envoi planifié). */
export function reportSheets(r: AnalyticsReport): { sheetName: string; rows: Row[] }[] {
  return [
    { sheetName: SHEET_NAME.global, rows: kpiRows(r.kpis) },
    { sheetName: SHEET_NAME.campaigns, rows: campaignRows(r.campaigns) },
    { sheetName: SHEET_NAME["leads-timeline"], rows: timelineRows(r.timeline) },
    { sheetName: SHEET_NAME["sales-performance"], rows: salesRows(r.sales) },
  ];
}

/** CSV séparé par des points-virgules (ouverture directe dans Excel en français). */
export function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0] as object);
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n");
}
