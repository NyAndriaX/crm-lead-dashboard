/**
 * Registre des handlers de jobs, indexés par `job.type`.
 * (Le worker reste découplé de l'app web : il n'importe que `@crm/db`.)
 *
 * Implémentés :
 *  - "noop"           : témoin de bout en bout
 *  - "scoring"        : recalcul du lead scoring (batch — CRM-019/066)
 *  - "import-process" : traitement CSV/XLSX (CRM-021 → CRM-027)
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
import { prisma, type Job } from "@crm/db";
import { runCampaignSend } from "../campaignSend";

export type JobHandler = (job: Job) => Promise<unknown> | unknown;

// ── Scoring weights (miroir de apps/web/lib/scoring.ts) ──────────────────────
const W = {
  hasEmail: 12, hasPhone: 8, hasCompany: 8, hasWebsite: 4, hasSector: 4, hasLocation: 4, enriched: 10,
  perOpen: 4, maxOpens: 12, perClick: 6, maxClicks: 18, replied: 20,
  statusBonus: { CONTACTE: 5, QUALIFIE: 12, EN_DISCUSSION: 18, CONVERTI: 25, PERDU: -10 } as Record<string, number>,
};

async function scoreLead(leadId: string): Promise<number | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const groups = await prisma.emailEvent.groupBy({ by: ["eventType"], where: { leadId }, _count: { _all: true } });
  const n = (t: string) => groups.find((g) => String(g.eventType) === t)?._count._all ?? 0;
  let s = 0;
  if (lead.emailHash) s += W.hasEmail;
  if (lead.phoneEnc) s += W.hasPhone;
  if (lead.company) s += W.hasCompany;
  if (lead.website) s += W.hasWebsite;
  if (lead.sector) s += W.hasSector;
  if (lead.city || lead.country) s += W.hasLocation;
  if (lead.enrichment) s += W.enriched;
  s += Math.min(W.maxOpens, n("OPEN") * W.perOpen);
  s += Math.min(W.maxClicks, n("CLICK") * W.perClick);
  if (n("REPLIED") > 0 || lead.lastReplyAt) s += W.replied;
  s += W.statusBonus[lead.status] ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(s)));
  if (score !== lead.score) await prisma.lead.update({ where: { id: leadId }, data: { score } });
  return score;
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
}

interface ColumnMapping {
  email?: string; phone?: string; firstName?: string; lastName?: string;
  company?: string; website?: string; sector?: string; city?: string;
  country?: string; source?: string; notes?: string;
}

async function processImport(job: Job): Promise<unknown> {
  const payload = (job.payload as unknown as ImportPayload) ?? {} as ImportPayload;
  const { importJobId, skipDuplicates = true, defaultSource, defaultTags = [] } = payload;

  const importJob = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!importJob) return { error: "ImportJob introuvable" };

  const update = (data: object) => prisma.importJob.update({ where: { id: importJobId }, data });

  if (!importJob.filePath || !fs.existsSync(importJob.filePath)) {
    await update({ status: "failed", errorReport: "Fichier source introuvable" });
    return { error: "Fichier source introuvable" };
  }

  const mapping = (importJob.mapping ?? {}) as { mapping?: ColumnMapping } & ColumnMapping;
  // Support both { mapping: {...} } and flat mapping formats
  const colMap: ColumnMapping = (mapping.mapping ?? mapping) as ColumnMapping;

  let importedRows = 0;
  let duplicateRows = 0;
  let errorRows = 0;
  const errors: string[] = [];

  try {
    const buffer = fs.readFileSync(importJob.filePath);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error("Fichier vide ou invalide");
    const sheet = wb.Sheets[firstSheetName];
    if (!sheet) throw new Error("Feuille introuvable");
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      try {
        const get = (field: keyof ColumnMapping) => {
          const col = colMap[field];
          return col ? String(row[col] ?? "").trim() || null : null;
        };

        const emailRaw = get("email");
        const phone = get("phone");
        const firstName = get("firstName");
        const lastName = get("lastName");
        const company = get("company");

        if (!emailRaw && !firstName && !lastName && !company) {
          errorRows++;
          errors.push(`Ligne ${i + 2} : aucune donnée identifiable`);
          continue;
        }

        // Dédoublonnage par email
        if (emailRaw) {
          const hash = emailHash(emailRaw);
          const existing = await prisma.lead.findFirst({ where: { emailHash: hash, deletedAt: null }, select: { id: true } });
          if (existing) {
            if (skipDuplicates) { duplicateRows++; continue; }
          }
        }

        const tags = [...defaultTags];
        const source = get("source") ?? defaultSource ?? null;

        const leadData = {
          emailEnc: encryptOrNull(emailRaw),
          emailHash: emailRaw ? emailHash(emailRaw) : null,
          phoneEnc: encryptOrNull(phone),
          firstName,
          lastName,
          company,
          website: get("website"),
          sector: get("sector"),
          city: get("city"),
          country: get("country"),
          source,
          notes: get("notes"),
          tags,
          lastActionAt: new Date(),
        };

        const lead = await prisma.lead.create({ data: leadData });

        // Score de base
        let s = 0;
        if (lead.emailHash) s += W.hasEmail;
        if (lead.phoneEnc) s += W.hasPhone;
        if (lead.company) s += W.hasCompany;
        if (lead.website) s += W.hasWebsite;
        if (lead.sector) s += W.hasSector;
        if (lead.city || lead.country) s += W.hasLocation;
        const score = Math.max(0, Math.min(100, Math.round(s)));
        if (score > 0) await prisma.lead.update({ where: { id: lead.id }, data: { score } });

        await prisma.leadHistory.create({
          data: { leadId: lead.id, userId: importJob.userId, type: "imported", payload: { importJobId } },
        });

        importedRows++;

        // Mise à jour du compteur toutes les 50 lignes
        if (importedRows % 50 === 0) {
          await update({ importedRows, duplicateRows, errorRows });
        }
      } catch (e) {
        errorRows++;
        errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const errorReport = errors.length > 0 ? errors.join("\n") : null;
    await update({ status: "done", importedRows, duplicateRows, errorRows, errorReport });
    return { importedRows, duplicateRows, errorRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await update({ status: "failed", errorReport: msg });
    throw e;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const handlers: Record<string, JobHandler> = {
  noop: async (job) => ({ ok: true, echoed: job.payload ?? null, at: new Date().toISOString() }),

  scoring: async (job) => {
    const payload = (job.payload ?? {}) as { leadId?: string; leadIds?: string[] };
    const ids = payload.leadIds ?? (payload.leadId ? [payload.leadId] : []);
    const results: Record<string, number | null> = {};
    for (const id of ids) results[id] = await scoreLead(id);
    return { scored: ids.length, results };
  },

  "import-process": processImport,

  notification: async (job) => {
    console.log("[worker] notification (placeholder):", job.payload);
    return { ok: true, delivered: "in-app only" };
  },

  "sequences-stop": async (job) => {
    console.log("[worker] sequences-stop (placeholder):", job.payload);
    return { ok: true };
  },

  "campaign-send": runCampaignSend,
};
