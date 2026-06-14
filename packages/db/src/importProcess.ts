/**
 * Traitement CSV/XLSX partagé web + worker (CRM-021 → CRM-027).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "./client";
import { emailHash, encryptOrNull } from "./piiCrypto";
import { syncTags } from "./tags";
import { getUploadDir } from "./uploadPaths";

const W = {
  hasEmail: 12,
  hasPhone: 8,
  hasCompany: 8,
  hasWebsite: 4,
  hasSector: 4,
  hasLocation: 4,
};

export interface ImportProcessOptions {
  importJobId: string;
  skipDuplicates?: boolean;
  defaultSource?: string;
  defaultTags?: string[] | null;
}

interface ColumnMapping {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  website?: string;
  sector?: string;
  city?: string;
  country?: string;
  source?: string;
  notes?: string;
  tags?: string;
}

function uploadDir(): string {
  return getUploadDir();
}

/** Résout le chemin fichier (compat anciens uploads + UPLOAD_DIR canonique). */
export function resolveImportFilePath(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  if (fs.existsSync(storedPath)) return storedPath;
  const alt = path.join(uploadDir(), path.basename(storedPath));
  if (fs.existsSync(alt)) return alt;
  return null;
}

function computeImportScore(data: {
  emailHash: string | null;
  phoneEnc: Buffer | null;
  company: string | null;
  website: string | null;
  sector: string | null;
  city: string | null;
  country: string | null;
}): number {
  let s = 0;
  if (data.emailHash) s += W.hasEmail;
  if (data.phoneEnc) s += W.hasPhone;
  if (data.company) s += W.hasCompany;
  if (data.website) s += W.hasWebsite;
  if (data.sector) s += W.hasSector;
  if (data.city || data.country) s += W.hasLocation;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export async function processImportJob(options: ImportProcessOptions): Promise<{
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
}> {
  const { importJobId, skipDuplicates = true, defaultSource } = options;
  const defaultTags: string[] = Array.isArray(options.defaultTags) ? options.defaultTags : [];

  const importJob = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!importJob) throw new Error("ImportJob introuvable");

  const update = (data: object) => prisma.importJob.update({ where: { id: importJobId }, data });

  const filePath = resolveImportFilePath(importJob.filePath);
  if (!filePath) {
    await update({ status: "failed", errorReport: "Fichier source introuvable" });
    throw new Error("Fichier source introuvable");
  }

  const mapping = (importJob.mapping ?? {}) as { mapping?: ColumnMapping } & ColumnMapping;
  const colMap: ColumnMapping = (mapping.mapping ?? mapping) as ColumnMapping;

  let importedRows = 0;
  let duplicateRows = 0;
  let errorRows = 0;
  const errors: string[] = [];
  const allTags = new Set<string>(defaultTags);
  const historyBatch: { leadId: string; userId: string; type: string; payload: object }[] = [];

  try {
    const buffer = fs.readFileSync(filePath);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new Error("Fichier vide ou invalide");
    const sheet = wb.Sheets[firstSheetName];
    if (!sheet) throw new Error("Feuille introuvable");
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

    const get = (row: Record<string, string>, field: keyof ColumnMapping) => {
      const col = colMap[field];
      return col ? String(row[col] ?? "").trim() || null : null;
    };

    const csvHashes = new Set<string>();
    for (const row of rows) {
      if (!row) continue;
      const emailRaw = get(row, "email");
      if (emailRaw) csvHashes.add(emailHash(emailRaw));
    }

    const hashList = [...csvHashes];
    const [existingLeads, blockedRows] = await Promise.all([
      hashList.length
        ? prisma.lead.findMany({
            where: { deletedAt: null, emailHash: { in: hashList } },
            select: { emailHash: true },
          })
        : Promise.resolve([]),
      hashList.length
        ? prisma.blacklist.findMany({
            where: { emailHash: { in: hashList } },
            select: { emailHash: true },
          })
        : Promise.resolve([]),
    ]);
    const knownHashes = new Set(existingLeads.map((l) => l.emailHash!).filter(Boolean));
    const blockedHashes = new Set(blockedRows.map((b) => b.emailHash));

    const flushHistory = async () => {
      if (!historyBatch.length) return;
      const batch = historyBatch.splice(0, historyBatch.length);
      await prisma.leadHistory.createMany({ data: batch });
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      try {
        const emailRaw = get(row, "email");
        const phone = get(row, "phone");
        const firstName = get(row, "firstName");
        const lastName = get(row, "lastName");
        const company = get(row, "company");

        if (!emailRaw && !firstName && !lastName && !company) {
          errorRows++;
          errors.push(`Ligne ${i + 2} : aucune donnée identifiable`);
          continue;
        }

        let emailHashVal: string | null = null;
        if (emailRaw) {
          emailHashVal = emailHash(emailRaw);
          if (blockedHashes.has(emailHashVal)) {
            errorRows++;
            errors.push(`Ligne ${i + 2} : email bloqué (blacklist)`);
            continue;
          }
          if (knownHashes.has(emailHashVal)) {
            if (skipDuplicates) {
              duplicateRows++;
              continue;
            }
          }
        }

        const rowTags = colMap.tags
          ? String(row[colMap.tags] ?? "")
              .split(/[,;|]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
        const tags = Array.from(new Set([...defaultTags, ...rowTags]));
        tags.forEach((t) => allTags.add(t));
        const source = get(row, "source") ?? defaultSource ?? null;

        const emailEnc = encryptOrNull(emailRaw);
        const phoneEnc = encryptOrNull(phone);
        const leadData = {
          emailEnc,
          emailHash: emailHashVal,
          phoneEnc,
          firstName,
          lastName,
          company,
          website: get(row, "website"),
          sector: get(row, "sector"),
          city: get(row, "city"),
          country: get(row, "country"),
          source,
          notes: get(row, "notes"),
          tags,
          ownerUserId: importJob.userId,
          lastActionAt: new Date(),
          score: computeImportScore({
            emailHash: emailHashVal,
            phoneEnc,
            company,
            website: get(row, "website"),
            sector: get(row, "sector"),
            city: get(row, "city"),
            country: get(row, "country"),
          }),
        };

        const lead = await prisma.lead.create({ data: leadData });
        if (emailHashVal) knownHashes.add(emailHashVal);

        historyBatch.push({
          leadId: lead.id,
          userId: importJob.userId,
          type: "imported",
          payload: { importJobId },
        });
        if (historyBatch.length >= 100) await flushHistory();

        importedRows++;

        if (importedRows % 50 === 0) {
          await update({ importedRows, duplicateRows, errorRows });
        }
      } catch (e) {
        errorRows++;
        errors.push(`Ligne ${i + 2} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await flushHistory();
    if (allTags.size > 0) await syncTags([...allTags]);

    const errorReport = errors.length > 0 ? errors.join("\n") : null;
    await update({ status: "done", importedRows, duplicateRows, errorRows, errorReport });
    return { importedRows, duplicateRows, errorRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await update({ status: "failed", errorReport: msg });
    throw e;
  }
}
