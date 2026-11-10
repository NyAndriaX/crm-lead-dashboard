/**
 * GET /api/analytics/export?report=<key>&period=<p>&format=xlsx|csv — AN-05.
 *
 * Exporte le rapport au format Excel (.xlsx) ou CSV. Le format CSV utilise
 * un séparateur point-virgule pour ouvrir directement dans Excel français.
 *
 * Rapports disponibles :
 *  - "global"            : KPIs globaux (1 ligne)
 *  - "campaigns"         : 1 ligne par campagne avec stats
 *  - "leads-timeline"    : 1 ligne par bucket temporel
 *  - "sales-performance" : 1 ligne par commercial
 *
 * La "planification d'envoi automatique par email" (point 2 d'AN-05) reste
 * à câbler ultérieurement via un job récurrent (@crm/queue) + un modèle ReportSchedule.
 */
import { z } from "zod";
import * as XLSX from "xlsx";
import { handler, parseQuery, requirePermission, ApiError } from "@/lib/api";
import {
  getGlobalKpis, listCampaignReports, getLeadsTimeline, getSalesPerformance,
  type Period,
} from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  report: z.enum(["global", "campaigns", "leads-timeline", "sales-performance"]),
  period: z.enum(["7d", "30d", "90d", "ytd", "all"]).optional().default("30d"),
  granularity: z.enum(["day", "week", "month"]).optional().default("week"),
  format: z.enum(["xlsx", "csv"]).optional().default("xlsx"),
});

type Row = Record<string, string | number | null | undefined>;

async function rowsForReport(args: {
  report: string;
  period: Period;
  granularity: "day" | "week" | "month";
}): Promise<{ rows: Row[]; sheetName: string }> {
  switch (args.report) {
    case "global": {
      const k = await getGlobalKpis(args.period);
      return {
        sheetName: "KPIs Globaux",
        rows: [
          { Indicateur: "Période", Valeur: args.period },
          { Indicateur: "Leads (total)", Valeur: k.leadsTotal },
          { Indicateur: "Leads actifs", Valeur: k.leadsActive },
          { Indicateur: "Leads créés sur la période", Valeur: k.leadsCreated },
          { Indicateur: "Emails envoyés", Valeur: k.emailsSent },
          { Indicateur: "Taux d'ouverture", Valeur: k.openRate != null ? `${k.openRate}%` : "—" },
          { Indicateur: "Taux de clic", Valeur: k.clickRate != null ? `${k.clickRate}%` : "—" },
          { Indicateur: "Taux de réponse", Valeur: k.replyRate != null ? `${k.replyRate}%` : "—" },
          { Indicateur: "Taux de bounce", Valeur: k.bounceRate != null ? `${k.bounceRate}%` : "—" },
          { Indicateur: "Taux de désabonnement", Valeur: k.unsubscribeRate != null ? `${k.unsubscribeRate}%` : "—" },
          { Indicateur: "Taux de conversion", Valeur: k.conversionRate != null ? `${k.conversionRate}%` : "—" },
          { Indicateur: "Réponses reçues (inbox)", Valeur: k.inboxMessagesReceived },
          { Indicateur: "Campagnes actives", Valeur: k.campaignsActive },
        ],
      };
    }
    case "campaigns": {
      const rows = await listCampaignReports();
      return {
        sheetName: "Campagnes",
        rows: rows.map((r) => ({
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
          "Taux ouv.": r.openRate != null ? `${r.openRate}%` : "—",
          "Taux clic": r.clickRate != null ? `${r.clickRate}%` : "—",
          "CTOR": r.ctorRate != null ? `${r.ctorRate}%` : "—",
          "Taux réponse": r.replyRate != null ? `${r.replyRate}%` : "—",
        })),
      };
    }
    case "leads-timeline": {
      const t = await getLeadsTimeline({ period: args.period, granularity: args.granularity });
      const rows: Row[] = t.buckets.map((b) => {
        const out: Row = { Période: b.period, Total: b.total };
        for (const src of t.sources) out[src] = b.bySource[src] ?? 0;
        return out;
      });
      return { sheetName: "Évolution Leads", rows };
    }
    case "sales-performance": {
      const rows = await getSalesPerformance(args.period);
      return {
        sheetName: "Performance commerciale",
        rows: rows.map((r) => ({
          Commercial: r.userName,
          Email: r.userEmail,
          "Leads assignés": r.leadsAssigned,
          Contactés: r.leadsContacted,
          Qualifiés: r.leadsQualified,
          Convertis: r.leadsConverted,
          Perdus: r.leadsLost,
          "Taux conversion": r.conversionRate != null ? `${r.conversionRate}%` : "—",
          "Score moyen": r.avgScore ?? "—",
          "Réponses reçues": r.repliesReceived,
        })),
      };
    }
    default:
      throw new ApiError(400, "Rapport inconnu", "unknown_report");
  }
}

function rowsToCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0] as object);
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    cols.join(";"),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(";")),
  ].join("\n");
}

export const GET = handler(async (req) => {
  await requirePermission("analytics:read");
  const { report, period, granularity, format } = parseQuery(req, querySchema);
  const { rows, sheetName } = await rowsForReport({ report, period, granularity });

  const fileBase = `analytics-${report}-${period}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const csv = "﻿" + rowsToCsv(rows); // BOM pour Excel FR
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  // XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
});
