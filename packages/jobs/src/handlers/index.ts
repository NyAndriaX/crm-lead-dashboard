/**
 * Registre des handlers de jobs (file MySQL @crm/queue), indexés par le nom du job.
 * (Le worker reste découplé de l'app web : il n'importe que `@crm/db` + `@crm/queue`.)
 *
 * Implémentés :
 *  - "noop"           : témoin de bout en bout
 *  - "scoring"        : recalcul du lead scoring (batch — CRM-019/066)
 *  - "import-process" : traitement CSV/XLSX (CRM-021 → CRM-027 ; colonnes obligatoires, validation des
 *                       formats et assignation : I-03 / I-07 / I-09)
 *
 * Placeholders :
 *  - "notification"   : envoi de la notification email (CRM-044)
 *  - "sequences-stop" : arrêt des séquences de relance d'un lead (CRM-041/047)
 *
 * Emailing / campagnes :
 *  - "campaign-send"  : envoi par lots des campagnes emailing — voir `campaignSend.ts`
 */
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as XLSX from "xlsx";
import {
  checkImportRow, computeLeadScore, defaultRequiredFields, loadScoringWeights, prisma, recomputeLeadScore, roundRobinAssignee,
  type ImportIssue, type ImportRowField,
} from "@crm/db";
import type { WorkerJobContext, WorkerJobHandler } from "@crm/queue";
import { runCampaignSend } from "../campaignSend";
import { runImapSync } from "../imapSync";
import { runSequenceTick } from "../sequenceTick";
import { runScraping, runScrapingScheduler } from "../scrapingRun";
import { runReportScheduleTick } from "../reports/schedule";

export type JobHandler = WorkerJobHandler;

// ── Scoring : formule partagée (@crm/db), poids de la config admin ─────────
async function scoreLead(leadId: string): Promise<number | null> {
  return recomputeLeadScore(prisma, leadId);
}

// ── Crypto (miroir de apps/web/lib/crypto.ts) ────────────────────────────────
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return key;
}
function getHmacSecret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant");
  return s;
}
function encryptValue(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}
function encryptOrNull(v: string | null | undefined): Buffer | null {
  return v == null || v === "" ? null : encryptValue(v);
}
function emailHash(email: string): string {
  return crypto.createHmac("sha256", getHmacSecret()).update(email.trim().toLowerCase()).digest("hex");
}

// ── Import processor (CRM-021 → CRM-027) ────────────────────────────────────

interface ImportPayload {
  importJobId: string;
  skipDuplicates?: boolean;
  defaultSource?: string;
  defaultTags?: string[];
  /** I-03 — colonnes obligatoires (déjà résolues par l'API ; absent sur les anciens jobs). */
  requiredFields?: ImportRowField[];
  /** I-09 — assignation : commerciaux validés par l'API (RBAC + comptes actifs). */
  assignMode?: "none" | "single" | "roundRobin";
  assigneeIds?: string[];
}

/** Plafond des anomalies détaillées conservées dans `importJobs.report` (les compteurs restent exacts). */
const MAX_REPORT_ISSUES = 2000;

interface ColumnMapping {
  email?: string; phone?: string; firstName?: string; lastName?: string;
  company?: string; website?: string; sector?: string; city?: string;
  country?: string; source?: string; notes?: string;
}

async function processImport(ctx: WorkerJobContext): Promise<unknown> {
  const payload = (ctx.payload as unknown as ImportPayload) ?? {} as ImportPayload;
  const { importJobId, skipDuplicates = true, defaultSource } = payload;
  // ⚠️ Le défaut `= []` ne couvre QUE `undefined`. Le payload web envoie
  // souvent `defaultTags: null` (aucun tag dans le mapping) → `[...null]`
  // levait "defaultTags is not iterable" sur CHAQUE ligne. On coerce.
  const defaultTags: string[] = Array.isArray(payload.defaultTags) ? payload.defaultTags : [];

  const importJob = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!importJob) return { error: "ImportJob introuvable" };

  const update = (data: object) => prisma.importJob.update({ where: { id: importJobId }, data });

  if (!importJob.filePath || !fs.existsSync(importJob.filePath)) {
    await update({ status: "failed", errorReport: "Fichier source introuvable" });
    return { error: "Fichier source introuvable" };
  }

  const mapping = (importJob.mapping ?? {}) as { mapping?: ColumnMapping; requiredFields?: ImportRowField[] } & ColumnMapping;
  // Support both { mapping: {...} } and flat mapping formats
  const colMap: ColumnMapping = (mapping.mapping ?? mapping) as ColumnMapping;
  const fields = (Object.keys(colMap) as (keyof ColumnMapping)[]).filter((f) => colMap[f]);
  const requiredFields: ImportRowField[] = Array.isArray(payload.requiredFields)
    ? payload.requiredFields
    : Array.isArray(mapping.requiredFields) ? mapping.requiredFields : defaultRequiredFields(fields);
  const assigneeIds = payload.assignMode && payload.assignMode !== "none" && Array.isArray(payload.assigneeIds) ? payload.assigneeIds : [];
  const assignedCount = new Map<string, number>();

  let importedRows = 0;
  let duplicateRows = 0;
  let errorRows = 0;
  let cleanedRows = 0;
  const errors: string[] = [];
  const issues: ImportIssue[] = [];
  const keepIssue = (i: ImportIssue) => { if (issues.length < MAX_REPORT_ISSUES) issues.push(i); };
  const buildReport = () => ({
    requiredFields,
    assignment: { mode: payload.assignMode ?? "none", counts: Object.fromEntries(assignedCount) },
    issues,
    truncated: issues.length >= MAX_REPORT_ISSUES,
  });

  try {
    const buffer = fs.readFileSync(importJob.filePath);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error("Fichier vide ou invalide");
    const sheet = wb.Sheets[firstSheetName];
    if (!sheet) throw new Error("Feuille introuvable");
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

    const weights = await loadScoringWeights(prisma);
    // Tags par défaut ajoutés au référentiel (comme une saisie manuelle sur la fiche).
    for (const name of new Set(defaultTags.map((t) => t.trim()).filter(Boolean))) {
      await prisma.tag.upsert({ where: { name }, create: { name }, update: {} }).catch(() => undefined);
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const line = i + 2; // ligne 1 = en-têtes
      try {
        const raw: Partial<Record<ImportRowField, string | null>> = {};
        for (const field of fields) raw[field] = String(row[colMap[field]!] ?? "");

        // I-03 / I-07 — colonnes obligatoires et formats (email, téléphone E.164, URL).
        const check = checkImportRow(line, raw, requiredFields);
        check.issues.forEach(keepIssue);
        if (check.rejected) {
          errorRows++;
          errors.push(...check.issues.filter((x) => x.action === "rejected").map((x) => `Ligne ${line} : ${x.reason}`));
          continue;
        }
        const v = check.values;
        const email = v.email ?? null;

        // Dédoublonnage par email
        if (email) {
          const hash = emailHash(email);
          const existing = await prisma.lead.findFirst({ where: { emailHash: hash, deletedAt: null }, select: { id: true } });
          if (existing) {
            if (skipDuplicates) { duplicateRows++; continue; }
          }
        }

        const tags = [...new Set(defaultTags)];
        const source = v.source ?? defaultSource ?? null;
        // I-09 — un seul commercial, ou tour de rôle sur les leads effectivement créés.
        const assignedToId = roundRobinAssignee(assigneeIds, importedRows);

        const leadData = {
          emailEnc: encryptOrNull(email),
          emailHash: email ? emailHash(email) : null,
          phoneEnc: encryptOrNull(v.phone),
          firstName: v.firstName ?? null,
          lastName: v.lastName ?? null,
          company: v.company ?? null,
          website: v.website ?? null,
          sector: v.sector ?? null,
          city: v.city ?? null,
          country: v.country ?? null,
          source,
          notes: v.notes ?? null,
          tags,
          assignedToId,
          lastActionAt: new Date(),
        };

        const lead = await prisma.lead.create({ data: leadData });

        // Score de base (profil seul : pas encore d'interaction ni d'analyse IA)
        const score = computeLeadScore(lead, undefined, weights);
        if (score > 0) await prisma.lead.update({ where: { id: lead.id }, data: { score } });

        await prisma.leadHistory.create({
          data: { leadId: lead.id, userId: importJob.userId, type: "imported", payload: { importJobId, source } },
        });
        if (assignedToId) {
          await prisma.leadHistory.create({
            data: { leadId: lead.id, userId: importJob.userId, type: "assigned", payload: { from: null, to: assignedToId, via: "import" } },
          });
          assignedCount.set(assignedToId, (assignedCount.get(assignedToId) ?? 0) + 1);
        }

        importedRows++;
        if (check.issues.length) cleanedRows++;

        // Mise à jour du compteur toutes les 50 lignes
        if (importedRows % 50 === 0) {
          await update({ importedRows, duplicateRows, errorRows, cleanedRows });
        }
      } catch (e) {
        errorRows++;
        const reason = e instanceof Error ? e.message : String(e);
        errors.push(`Ligne ${line} : ${reason}`);
        keepIssue({ row: line, action: "rejected", field: null, reason: `erreur d'enregistrement : ${reason}` });
      }
    }

    // Une notification récapitulative par commercial (pas une par lead).
    for (const [userId, count] of assignedCount) {
      if (userId === importJob.userId) continue;
      await prisma.notification.create({
        data: {
          userId,
          type: "lead_assigned",
          title: "Nouveaux leads assignés",
          body: `${count} lead${count > 1 ? "s" : ""} importé${count > 1 ? "s" : ""} (${importJob.fileName}) vous ${count > 1 ? "ont" : "a"} été assigné${count > 1 ? "s" : ""}.`,
          link: "/leads",
        },
      });
    }

    const errorReport = errors.length > 0 ? errors.join("\n") : null;
    await update({ status: "done", importedRows, duplicateRows, errorRows, cleanedRows, errorReport, report: buildReport() });
    return { importedRows, duplicateRows, errorRows, cleanedRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await update({ status: "failed", errorReport: msg });
    throw e;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const handlers: Record<string, JobHandler> = {
  noop: async (ctx) => ({ ok: true, echoed: ctx.payload ?? null, at: new Date().toISOString() }),

  scoring: async (ctx) => {
    const payload = (ctx.payload ?? {}) as { leadId?: string; leadIds?: string[] };
    const ids = payload.leadIds ?? (payload.leadId ? [payload.leadId] : []);
    const results: Record<string, number | null> = {};
    for (const id of ids) results[id] = await scoreLead(id);
    return { scored: ids.length, results };
  },

  "import-process": processImport,

  notification: async (ctx) => {
    console.log("[worker] notification (placeholder):", ctx.payload);
    return { ok: true, delivered: "in-app only" };
  },

  "sequences-stop": async (ctx) => {
    console.log("[worker] sequences-stop (placeholder):", ctx.payload);
    return { ok: true };
  },

  "campaign-send": runCampaignSend,

  "imap-sync": runImapSync,

  "sequence-tick": runSequenceTick,

  "scraping-run": async (ctx) => {
    console.log("[worker] scraping-run — job reçu", ctx.payload);
    return runScraping(ctx);
  },

  "scraping-scheduler": async () => runScrapingScheduler(),

  // AN-05 : envoi planifié des rapports d'analytique par email (récurrent ; `{ scheduleId }` = envoi immédiat).
  "report-schedule-tick": (ctx) => runReportScheduleTick(ctx),

  // Rétention RGPD (équivalent des anciens index TTL MongoDB) : journaux 12 mois, imports 90 jours.
  "retention-purge": async () => {
    const months12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const days90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [auditLogs, leadHistory, importJobs] = await Promise.all([
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: months12 } } }),
      prisma.leadHistory.deleteMany({ where: { createdAt: { lt: months12 } } }),
      prisma.importJob.deleteMany({ where: { createdAt: { lt: days90 } } }),
    ]);
    return { auditLogs: auditLogs.count, leadHistory: leadHistory.count, importJobs: importJobs.count };
  },
};
