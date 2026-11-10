/**
 * AN-05 — Envoi planifié du rapport d'analytique par email.
 *
 * Job récurrent `report-schedule-tick` (scheduleRecurring, toutes les 15 min par défaut —
 * REPORT_SCHEDULE_TICK_INTERVAL) : envoie chaque plan actif dont `nextRunAt` est échu, puis calcule
 * la prochaine échéance. Le même job, enfilé avec `{ scheduleId }`, sert au bouton « Envoyer maintenant ».
 *
 * Email : résumé des indicateurs clés dans le corps, rapport PDF en pièce jointe (+ classeur Excel en option).
 * Les heures s'entendent dans le fuseau du worker (WORKER_TIMEZONE / Configuration).
 */
import * as XLSX from "xlsx";
import type { SendMailOptions } from "nodemailer";
import { asStringArray, prisma, type ReportSchedule } from "@crm/db";
import type { WorkerJobContext } from "@crm/queue";
import type { Period } from "./analyticsData";
import { renderAnalyticsPdf } from "./pdf";
import { buildAnalyticsReport, PERIOD_LABEL, reportSheets, type AnalyticsReport } from "./rows";
import { resolveReportTransport } from "./mailer";

export type ReportFrequency = "daily" | "weekly" | "monthly";

export type SchedulePlan = {
  frequency: string;
  hour: number;
  dayOfWeek: number | null; // 1 = lundi … 7 = dimanche
  dayOfMonth: number | null; // 1-28
};

/** Prochaine échéance strictement postérieure à `from` (heure locale du process). */
export function computeNextRun(plan: SchedulePlan, from: Date = new Date()): Date {
  const hour = Math.min(23, Math.max(0, Math.trunc(plan.hour)));
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, 0, 0, 0);
  if (plan.frequency === "monthly") {
    const dom = Math.min(28, Math.max(1, plan.dayOfMonth ?? 1));
    d.setDate(dom);
    if (d <= from) d.setMonth(d.getMonth() + 1, dom);
    return d;
  }
  if (plan.frequency === "weekly") {
    const target = Math.min(7, Math.max(1, plan.dayOfWeek ?? 1)) % 7; // getDay() : 0 = dimanche
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0 && d <= from) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

const FREQ_LABEL: Record<string, string> = { daily: "quotidien", weekly: "hebdomadaire", monthly: "mensuel" };
const DAY_LABEL = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export function describePlan(plan: SchedulePlan): string {
  const h = `${String(plan.hour).padStart(2, "0")} h`;
  if (plan.frequency === "weekly") return `Chaque ${DAY_LABEL[plan.dayOfWeek ?? 1]} à ${h}`;
  if (plan.frequency === "monthly") return `Le ${plan.dayOfMonth ?? 1} de chaque mois à ${h}`;
  return `Chaque jour à ${h}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (v: number | null) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

/** Compose l'email du rapport (pur : testé sans base ni SMTP). */
export function composeReportEmail(args: {
  schedule: Pick<ReportSchedule, "name" | "frequency" | "includeXlsx"> & { recipients: string[] };
  report: AnalyticsReport;
  pdf: Buffer;
  xlsx?: Buffer | null;
  from: string;
}): SendMailOptions {
  const { schedule, report, pdf, xlsx, from } = args;
  const day = report.generatedAt.toISOString().slice(0, 10);
  const k = report.kpis;
  const lines: [string, string][] = [
    ["Leads créés", String(k.leadsCreated)],
    ["Emails envoyés", String(k.emailsSent)],
    ["Taux d'ouverture", pct(k.openRate)],
    ["Taux de réponse", pct(k.replyRate)],
    ["Taux de bounce", pct(k.bounceRate)],
    ["Conversion", pct(k.conversionRate)],
  ];
  const subject = `Rapport ${FREQ_LABEL[schedule.frequency] ?? ""} — ${schedule.name} (${PERIOD_LABEL[report.period]})`.replace(/\s+/g, " ");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e2538">
      <h2 style="margin:0 0 4px">${esc(schedule.name)}</h2>
      <p style="margin:0 0 16px;color:#64748b">Rapport d'analytique CRM Lead — ${esc(PERIOD_LABEL[report.period])}</p>
      <table style="border-collapse:collapse;width:100%">
        ${lines.map(([l, v]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${esc(l)}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join("")}
      </table>
      <p style="margin-top:16px">Le rapport complet (indicateurs, campagnes, performance commerciale, évolution des leads) est joint en PDF${xlsx ? ", avec le classeur Excel" : ""}.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Envoi automatique programmé dans CRM Lead (Analytique › Export). Pour ne plus le recevoir, demandez à un administrateur de modifier le plan d'envoi.</p>
    </div>`;
  const text = `${schedule.name}\nRapport d'analytique CRM Lead — ${PERIOD_LABEL[report.period]}\n\n${lines.map(([l, v]) => `${l} : ${v}`).join("\n")}\n\nRapport complet en pièce jointe.`;
  const attachments: NonNullable<SendMailOptions["attachments"]> = [
    { filename: `rapport-analytique-${report.period}-${day}.pdf`, content: pdf, contentType: "application/pdf" },
  ];
  if (xlsx) {
    attachments.push({
      filename: `rapport-analytique-${report.period}-${day}.xlsx`,
      content: xlsx,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  return { from, to: schedule.recipients.join(", "), subject, html, text, attachments };
}

export function reportWorkbook(report: AnalyticsReport): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of reportSheets(report)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: "Aucune donnée" }]), s.sheetName.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Dépendances du handler (injectables pour les tests). */
export type ReportTickDeps = {
  now: () => Date;
  findSchedules: (scheduleId: string | null, now: Date) => Promise<ReportSchedule[]>;
  buildReport: (period: Period) => Promise<AnalyticsReport>;
  renderPdf: (report: AnalyticsReport) => Promise<Buffer>;
  send: (schedule: ReportSchedule, mail: (from: string) => SendMailOptions) => Promise<{ messageId: string; via: string }>;
  save: (id: string, data: { lastSentAt?: Date; lastError: string | null; nextRunAt: Date }) => Promise<void>;
};

export const defaultReportTickDeps: ReportTickDeps = {
  now: () => new Date(),
  findSchedules: (scheduleId, now) =>
    scheduleId
      ? prisma.reportSchedule.findMany({ where: { id: scheduleId } })
      : prisma.reportSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: 50 }),
  buildReport: (period) => buildAnalyticsReport(period),
  renderPdf: (report) => renderAnalyticsPdf(report),
  send: async (schedule, mail) => {
    const t = await resolveReportTransport(schedule.smtpConfigId);
    const info = await t.transporter.sendMail(mail(t.from));
    if (t.smtpConfigId) await prisma.smtpConfig.update({ where: { id: t.smtpConfigId }, data: { sentToday: { increment: 1 } } });
    return { messageId: String(info.messageId ?? ""), via: t.via };
  },
  save: async (id, data) => {
    await prisma.reportSchedule.update({ where: { id }, data });
  },
};

const PERIODS: Period[] = ["7d", "30d", "90d", "ytd", "all"];

export async function runReportScheduleTick(ctx: WorkerJobContext, deps: ReportTickDeps = defaultReportTickDeps): Promise<unknown> {
  const payload = (ctx.payload ?? {}) as { scheduleId?: string };
  const now = deps.now();
  const schedules = await deps.findSchedules(payload.scheduleId ?? null, now);
  const results: { id: string; ok: boolean; recipients: number; via?: string; error?: string }[] = [];

  for (const s of schedules) {
    const recipients = asStringArray(s.recipients).filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
    const nextRunAt = computeNextRun(s, now);
    if (recipients.length === 0) {
      await deps.save(s.id, { lastError: "Aucun destinataire valide", nextRunAt });
      results.push({ id: s.id, ok: false, recipients: 0, error: "Aucun destinataire valide" });
      continue;
    }
    try {
      const period = PERIODS.includes(s.period as Period) ? (s.period as Period) : "30d";
      const report = await deps.buildReport(period);
      const pdf = await deps.renderPdf(report);
      const xlsx = s.includeXlsx ? reportWorkbook(report) : null;
      const r = await deps.send(s, (from) => composeReportEmail({ schedule: { ...s, recipients }, report, pdf, xlsx, from }));
      await deps.save(s.id, { lastSentAt: now, lastError: null, nextRunAt });
      results.push({ id: s.id, ok: true, recipients: recipients.length, via: r.via });
      console.log(`[report-schedule] plan=${s.id} envoyé à ${recipients.length} destinataire(s) via ${r.via} — prochain envoi ${nextRunAt.toISOString()}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.save(s.id, { lastError: msg.slice(0, 1000), nextRunAt });
      results.push({ id: s.id, ok: false, recipients: recipients.length, error: msg });
      console.error(`[report-schedule] plan=${s.id} échec : ${msg}`);
    }
  }
  return { processed: schedules.length, sent: results.filter((r) => r.ok).length, results };
}
