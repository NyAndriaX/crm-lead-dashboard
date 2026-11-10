/**
 * AN-05 — Rendu PDF du rapport d'analytique (pdfkit, licence MIT ; polices PDF standard Helvetica,
 * aucun fichier de police à embarquer). Utilisé par l'export `GET /api/analytics/export?format=pdf`
 * et par l'envoi planifié par email (`report-schedule-tick`).
 *
 * Contenu : en-tête (période, date de génération), indicateurs clés en tuiles, puis les tableaux
 * Campagnes, Performance commerciale et Évolution des leads ; pagination « page X / Y ».
 * Côté Next.js, `pdfkit` est déclaré dans `serverExternalPackages` (il lit ses métriques de police
 * sur le disque et ne doit pas être bundlé).
 */
import PDFDocument from "pdfkit";
import { CAMPAIGN_STATUS_LABEL, PERIOD_LABEL, REPORT_KEYS, type AnalyticsReport, type ReportKey } from "./rows";

const C = {
  text: "#1e2538",
  muted: "#64748b",
  border: "#e2e8f0",
  zebra: "#f8fafc",
  accent: "#7c3aed",
  accentSoft: "#f3eefe",
};

const MARGIN = 40;

type Doc = PDFKit.PDFDocument;
type Col = { header: string; width: number; align?: "left" | "right" };

const fmtPct = (v: number | null | undefined): string => (v == null ? "—" : `${String(v).replace(".", ",")} %`);
const fmtNum = (v: number): string => v.toLocaleString("fr-FR").replace(/ | /g, " ");

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Tronque un texte à la largeur disponible (police courante). */
function fit(doc: Doc, text: string, width: number): string {
  if (doc.widthOfString(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}

function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - 20) doc.addPage();
}

function sectionTitle(doc: Doc, title: string, subtitle?: string) {
  ensureSpace(doc, 70);
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.text).text(title, MARGIN, doc.y);
  if (subtitle) doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(subtitle);
  doc.moveDown(0.4);
}

function table(doc: Doc, cols: Col[], rows: string[][], empty = "Aucune donnée sur la période.") {
  const rowH = 18;
  const totalW = cols.reduce((a, c) => a + c.width, 0);
  const header = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, totalW, rowH).fill(C.accentSoft);
    let x = MARGIN;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.accent);
    for (const c of cols) {
      doc.text(fit(doc, c.header, c.width - 8), x + 4, y + 5, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    }
    doc.y = y + rowH;
  };
  ensureSpace(doc, rowH * 2);
  header();
  if (rows.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(C.muted).text(empty, MARGIN + 4, doc.y + 5);
    doc.y += 8;
    return;
  }
  rows.forEach((r, i) => {
    if (doc.y + rowH > doc.page.height - MARGIN - 20) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(MARGIN, y, totalW, rowH).fill(C.zebra);
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + totalW, y + rowH).lineWidth(0.5).strokeColor(C.border).stroke();
    let x = MARGIN;
    doc.font("Helvetica").fontSize(8).fillColor(C.text);
    cols.forEach((c, j) => {
      doc.text(fit(doc, r[j] ?? "", c.width - 8), x + 4, y + 5, { width: c.width - 8, align: c.align ?? "left", lineBreak: false });
      x += c.width;
    });
    doc.y = y + rowH;
  });
}

function kpiTiles(doc: Doc, report: AnalyticsReport) {
  const k = report.kpis;
  const tiles: [string, string, string?][] = [
    ["Leads (total)", fmtNum(k.leadsTotal), `dont ${fmtNum(k.leadsActive)} actifs`],
    ["Leads créés", fmtNum(k.leadsCreated), "sur la période"],
    ["Emails envoyés", fmtNum(k.emailsSent), `${k.campaignsActive} campagne(s) active(s)`],
    ["Taux d'ouverture", fmtPct(k.openRate)],
    ["Taux de clic", fmtPct(k.clickRate)],
    ["Taux de réponse", fmtPct(k.replyRate), `${fmtNum(k.inboxMessagesReceived)} réponse(s) reçue(s)`],
    ["Taux de bounce", fmtPct(k.bounceRate)],
    ["Désabonnement", fmtPct(k.unsubscribeRate)],
    ["Conversion", fmtPct(k.conversionRate)],
  ];
  const perRow = 3;
  const gap = 10;
  const w = (doc.page.width - MARGIN * 2 - gap * (perRow - 1)) / perRow;
  const h = 54;
  ensureSpace(doc, (h + gap) * 3);
  const top = doc.y;
  tiles.forEach(([label, value, hint], i) => {
    const x = MARGIN + (i % perRow) * (w + gap);
    const y = top + Math.floor(i / perRow) * (h + gap);
    doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(C.border).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(label.toUpperCase(), x + 10, y + 8, { width: w - 20, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(C.text).text(value, x + 10, y + 20, { width: w - 20, lineBreak: false });
    if (hint) doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(hint, x + 10, y + 40, { width: w - 20, lineBreak: false });
  });
  doc.y = top + Math.ceil(tiles.length / perRow) * (h + gap);
}

/**
 * Génère le PDF du rapport. `sections` limite le contenu (export d'un seul rapport) ;
 * par défaut, toutes les sections.
 */
export function renderAnalyticsPdf(report: AnalyticsReport, sections: ReportKey[] = REPORT_KEYS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: { Title: "Rapport d'analytique — CRM Lead", Author: "CRM Lead", Subject: `Période : ${PERIOD_LABEL[report.period]}` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // En-tête
    doc.rect(0, 0, doc.page.width, 78).fill(C.accent);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff").text("Rapport d'analytique", MARGIN, 22);
    doc.font("Helvetica").fontSize(9.5).fillColor("#ede9fe")
      .text(`CRM Lead · Période : ${PERIOD_LABEL[report.period]} · généré le ${fmtDate(report.generatedAt)}`, MARGIN, 48);
    doc.y = 98;

    if (sections.includes("global")) {
      sectionTitle(doc, "Indicateurs clés", "Taux calculés en contacts uniques sur les envois de la période.");
      kpiTiles(doc, report);
    }

    if (sections.includes("campaigns")) {
      sectionTitle(doc, "Campagnes", `${report.campaigns.length} campagne(s) — toutes périodes.`);
      table(
        doc,
        [
          { header: "Campagne", width: 165 }, { header: "Statut", width: 60 },
          { header: "Envoyés", width: 50, align: "right" }, { header: "Ouv.", width: 50, align: "right" },
          { header: "Clics", width: 50, align: "right" }, { header: "Réponses", width: 55, align: "right" },
          { header: "Bounces", width: 85, align: "right" },
        ],
        report.campaigns.map((c) => [
          c.name, CAMPAIGN_STATUS_LABEL[c.status] ?? c.status, fmtNum(c.sent),
          fmtPct(c.openRate), fmtPct(c.clickRate), fmtPct(c.replyRate), fmtNum(c.bounces),
        ]),
      );
    }

    if (sections.includes("sales-performance")) {
      sectionTitle(doc, "Performance commerciale", "Leads assignés par commercial, mis à jour sur la période.");
      table(
        doc,
        [
          { header: "Commercial", width: 145 }, { header: "Assignés", width: 55, align: "right" },
          { header: "Contactés", width: 55, align: "right" }, { header: "Qualifiés", width: 55, align: "right" },
          { header: "Convertis", width: 55, align: "right" }, { header: "Conversion", width: 60, align: "right" },
          { header: "Réponses", width: 90, align: "right" },
        ],
        report.sales.map((s) => [
          s.userName, fmtNum(s.leadsAssigned), fmtNum(s.leadsContacted), fmtNum(s.leadsQualified),
          fmtNum(s.leadsConverted), fmtPct(s.conversionRate), fmtNum(s.repliesReceived),
        ]),
      );
    }

    if (sections.includes("leads-timeline")) {
      const g = report.granularity === "day" ? "jour" : report.granularity === "month" ? "mois" : "semaine";
      sectionTitle(doc, "Évolution des leads", `Leads créés par ${g} et par source (5 sources principales).`);
      const totals = new Map<string, number>();
      for (const b of report.timeline.buckets) for (const [s, n] of Object.entries(b.bySource)) totals.set(s, (totals.get(s) ?? 0) + n);
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
      const srcW = top.length ? Math.floor(355 / top.length) : 0;
      table(
        doc,
        [{ header: "Période", width: 90 }, { header: "Total", width: 70, align: "right" }, ...top.map((s) => ({ header: s, width: srcW, align: "right" as const }))],
        report.timeline.buckets.map((b) => [b.period, fmtNum(b.total), ...top.map((s) => fmtNum(b.bySource[s] ?? 0))]),
      );
    }

    // Pied de page sur toutes les pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // écrire dans la marge basse sans déclencher de saut de page
      const y = doc.page.height - MARGIN + 10;
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(`CRM Lead — rapport d'analytique · page ${i + 1} / ${range.count}`, MARGIN, y, {
          width: doc.page.width - MARGIN * 2, align: "center", lineBreak: false,
        });
    }
    doc.end();
  });
}
