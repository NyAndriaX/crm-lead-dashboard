/**
 * AN-05 — Génération du PDF du rapport d'analytique, calcul des échéances et handler
 * `report-schedule-tick` (dépendances injectées : ni base, ni SMTP).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as zlib from "node:zlib";
import type { ReportSchedule } from "@crm/db";
import { renderAnalyticsPdf } from "../src/reports/pdf";
import type { AnalyticsReport } from "../src/reports/rows";
import { composeReportEmail, computeNextRun, describePlan, runReportScheduleTick, type ReportTickDeps } from "../src/reports/schedule";

function fakeReport(campaigns = 3): AnalyticsReport {
  return {
    generatedAt: new Date(2026, 9, 29, 11, 0),
    period: "30d",
    granularity: "week",
    kpis: {
      period: "30d", leadsTotal: 1250, leadsActive: 1100, leadsCreated: 87, emailsSent: 640,
      openRate: 41.2, clickRate: 9.8, replyRate: 6.1, conversionRate: 3.4, bounceRate: 1.7, unsubscribeRate: 0.3,
      inboxMessagesReceived: 39, campaignsActive: 2,
    },
    campaigns: Array.from({ length: campaigns }, (_, i) => ({
      id: `c${i}`, name: `Campagne de démonstration n°${i + 1} — PME Lyon`, status: i % 2 ? "DONE" : "SENDING",
      scheduledAt: null, createdAt: new Date(2026, 9, 1), sent: 100 + i, delivered: 98, opens: 40, clicks: 9, bounces: 2,
      unsubs: 0, replies: 6, openRate: 40, clickRate: 9, replyRate: 6, ctorRate: 22.5,
    })),
    timeline: {
      sources: ["scraping", "import"],
      buckets: [
        { period: "2026-W42", total: 40, bySource: { scraping: 30, import: 10 } },
        { period: "2026-W43", total: 47, bySource: { scraping: 35, import: 12 } },
      ],
    },
    sales: [{
      userId: "u1", userName: "Élodie Martin", userEmail: "elodie@crm.local", teamId: null, leadsAssigned: 120, leadsContacted: 60,
      leadsQualified: 25, leadsConverted: 8, leadsLost: 5, conversionRate: 6.7, avgScore: 54.2, repliesReceived: 14,
    }],
  };
}

/** Texte des flux de contenu du PDF (pdfkit compresse les flux et encode le texte en hexadécimal). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  let out = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = zlib.inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const h of content.matchAll(/<([0-9a-fA-F]+)>/g)) out += Buffer.from(h[1]!, "hex").toString("latin1");
  }
  return out;
}

test("le PDF du rapport est valide et contient les indicateurs clés et les tableaux", async () => {
  const pdf = await renderAnalyticsPdf(fakeReport());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.toString("latin1").trimEnd().endsWith("%%EOF"));
  const text = pdfText(pdf);
  for (const s of ["Rapport d'analytique", "Indicateurs clés", "Campagnes", "Performance commerciale", "Évolution des leads", "41,2 %", "Élodie Martin", "2026-W43"]) {
    assert.ok(text.includes(s), `texte attendu dans le PDF : ${s}`);
  }
});

test("le PDF pagine les longs tableaux (en-tête répété, pied « page X / Y »)", async () => {
  const pdf = await renderAnalyticsPdf(fakeReport(80));
  const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 3, `au moins 3 pages attendues, obtenu ${pages}`);
  assert.ok(pdfText(pdf).includes(`page ${pages} / ${pages}`));
});

test("export d'une seule section : uniquement les indicateurs clés", async () => {
  const text = pdfText(await renderAnalyticsPdf(fakeReport(), ["global"]));
  assert.ok(text.includes("Indicateurs clés"));
  assert.ok(!text.includes("Performance commerciale"));
});

test("échéances quotidienne, hebdomadaire et mensuelle", () => {
  const from = new Date(2026, 9, 29, 9, 30); // jeudi 29 octobre 2026, 9 h 30
  assert.deepEqual(computeNextRun({ frequency: "daily", hour: 8, dayOfWeek: null, dayOfMonth: null }, from), new Date(2026, 9, 30, 8));
  assert.deepEqual(computeNextRun({ frequency: "daily", hour: 18, dayOfWeek: null, dayOfMonth: null }, from), new Date(2026, 9, 29, 18));
  assert.deepEqual(computeNextRun({ frequency: "weekly", hour: 8, dayOfWeek: 1, dayOfMonth: null }, from), new Date(2026, 10, 2, 8)); // lundi
  assert.deepEqual(computeNextRun({ frequency: "weekly", hour: 10, dayOfWeek: 4, dayOfMonth: null }, from), new Date(2026, 9, 29, 10)); // jeudi même jour
  assert.deepEqual(computeNextRun({ frequency: "weekly", hour: 8, dayOfWeek: 4, dayOfMonth: null }, from), new Date(2026, 10, 5, 8)); // jeudi suivant
  assert.deepEqual(computeNextRun({ frequency: "monthly", hour: 7, dayOfWeek: null, dayOfMonth: 1 }, from), new Date(2026, 10, 1, 7));
  assert.deepEqual(computeNextRun({ frequency: "monthly", hour: 7, dayOfWeek: null, dayOfMonth: 1 }, new Date(2026, 11, 15)), new Date(2027, 0, 1, 7));
  assert.equal(describePlan({ frequency: "weekly", hour: 8, dayOfWeek: 1, dayOfMonth: null }), "Chaque lundi à 08 h");
});

test("l'email du rapport joint le PDF (et le classeur Excel en option)", () => {
  const mail = composeReportEmail({
    schedule: { name: "Point du lundi", frequency: "weekly", includeXlsx: true, recipients: ["a@crm.local", "b@crm.local"] },
    report: fakeReport(), pdf: Buffer.from("%PDF-1.3"), xlsx: Buffer.from("xlsx"), from: "\"CRM\" <noreply@crm.local>",
  });
  assert.equal(mail.to, "a@crm.local, b@crm.local");
  assert.match(String(mail.subject), /Rapport hebdomadaire — Point du lundi/);
  assert.equal(mail.attachments?.length, 2);
  assert.equal(mail.attachments?.[0]?.contentType, "application/pdf");
  assert.match(String(mail.html), /41,2 %|6,1 %/);
});

function schedule(over: Partial<ReportSchedule> = {}): ReportSchedule {
  return {
    id: "s1", name: "Point du lundi", enabled: true, frequency: "weekly", hour: 8, dayOfWeek: 1, dayOfMonth: null, period: "30d",
    recipients: ["direction@crm.local"], includeXlsx: false, smtpConfigId: null, nextRunAt: new Date(2026, 9, 26, 8),
    lastSentAt: null, lastError: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

function deps(list: ReportSchedule[], failSend = false) {
  const saved: { id: string; data: Parameters<ReportTickDeps["save"]>[1] }[] = [];
  const sent: { to: unknown; attachments: number }[] = [];
  const d: ReportTickDeps = {
    now: () => new Date(2026, 9, 29, 9, 30),
    findSchedules: async (id) => (id ? list.filter((s) => s.id === id) : list),
    buildReport: async () => fakeReport(),
    renderPdf: async (r) => renderAnalyticsPdf(r),
    send: async (_s, mail) => {
      if (failSend) throw new Error("SMTP indisponible");
      const m = mail("\"CRM\" <noreply@crm.local>");
      sent.push({ to: m.to, attachments: m.attachments?.length ?? 0 });
      return { messageId: "<x@crm.local>", via: "test" };
    },
    save: async (id, data) => {
      saved.push({ id, data });
    },
  };
  return { d, saved, sent };
}

test("handler : envoie les plans échus, joint le PDF et planifie l'échéance suivante", async () => {
  const { d, saved, sent } = deps([schedule(), schedule({ id: "s2", includeXlsx: true, recipients: ["x@crm.local", "pas-une-adresse"] })]);
  const r = (await runReportScheduleTick({ payload: {} } as never, d)) as { processed: number; sent: number };
  assert.equal(r.processed, 2);
  assert.equal(r.sent, 2);
  assert.deepEqual(sent.map((s) => s.attachments), [1, 2]);
  assert.equal(sent[1]!.to, "x@crm.local"); // adresse invalide écartée
  assert.deepEqual(saved[0]!.data.nextRunAt, new Date(2026, 10, 2, 8));
  assert.equal(saved[0]!.data.lastError, null);
  assert.ok(saved[0]!.data.lastSentAt);
});

test("handler : un échec SMTP est enregistré sans bloquer la planification", async () => {
  const { d, saved } = deps([schedule()], true);
  const r = (await runReportScheduleTick({ payload: { scheduleId: "s1" } } as never, d)) as { sent: number };
  assert.equal(r.sent, 0);
  assert.equal(saved[0]!.data.lastError, "SMTP indisponible");
  assert.equal(saved[0]!.data.lastSentAt, undefined);
  assert.deepEqual(saved[0]!.data.nextRunAt, new Date(2026, 10, 2, 8));
});

test("handler : un plan sans destinataire valide n'envoie rien", async () => {
  const { d, saved, sent } = deps([schedule({ recipients: [] })]);
  await runReportScheduleTick({ payload: {} } as never, d);
  assert.equal(sent.length, 0);
  assert.equal(saved[0]!.data.lastError, "Aucun destinataire valide");
});
