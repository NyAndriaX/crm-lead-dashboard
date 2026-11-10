/**
 * Service Import — CRM-021 → CRM-027.
 * Gère le cycle de vie d'un ImportJob :
 *  1. Création + upload du fichier (parse headers + aperçu).
 *  2. Validation et démarrage du traitement (worker job "import-process").
 *  3. Consultation du statut + listing historique.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { prisma, type Role } from "@crm/db";
import { ApiError } from "../api";
import { enqueue } from "../jobs";
import { can } from "../rbac";
import { IMPORTABLE_FIELD_LABELS, defaultRequiredFields, type StartImportInput } from "../schemas/import";

export const ACCEPTED_EXTS = ["csv", "xlsx", "xls"] as const;

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

/** Sauvegarde le fichier sur disque et retourne son chemin absolu. */
export async function saveUploadedFile(file: File): Promise<{ filePath: string; ext: string }> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_EXTS as readonly string[]).includes(ext)) {
    throw new ApiError(400, `Format non supporté. Acceptés : ${ACCEPTED_EXTS.join(", ")}`, "invalid_format");
  }
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return { filePath, ext };
}

/** Lit les en-têtes et les premières lignes du fichier pour le mapping. */
export function parseFilePreview(
  buffer: Buffer,
): { headers: string[]; previewRows: Record<string, string>[]; totalRows: number } {
  const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 11 });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], previewRows: [], totalRows: 0 };
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) return { headers: [], previewRows: [], totalRows: 0 };
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!raw.length) return { headers: [], previewRows: [], totalRows: 0 };

  const headers = (raw[0] as unknown[]).map(String);
  const previewRows = raw.slice(1, 11).map((row) => {
    const r: Record<string, string> = {};
    headers.forEach((h, i) => { r[h] = String((row as unknown[])[i] ?? ""); });
    return r;
  });

  // Compte total sans charger tout en mémoire
  const wbFull = XLSX.read(buffer, { type: "buffer" });
  const firstSheetNameFull = wbFull.SheetNames[0] ?? firstSheetName;
  const sheetFull = wbFull.Sheets[firstSheetNameFull];
  const range = XLSX.utils.decode_range(sheetFull?.["!ref"] ?? "A1");
  const totalRows = Math.max(0, range.e.r); // rows - 1 header

  return { headers, previewRows, totalRows };
}

/** Crée l'ImportJob initial après upload. */
export async function createImportJob(
  userId: string,
  file: File,
): Promise<{
  id: string; fileName: string; status: string;
  headers: string[]; previewRows: Record<string, string>[]; totalRows: number;
}> {
  const { filePath } = await saveUploadedFile(file);
  const buffer = await fs.readFile(filePath);
  const { headers, previewRows, totalRows } = parseFilePreview(buffer);

  const job = await prisma.importJob.create({
    data: { userId, fileName: file.name, filePath, totalRows, status: "pending" },
  });

  return { id: job.id, fileName: job.fileName, status: job.status, headers, previewRows, totalRows };
}

/** Rôles auxquels on peut confier des leads importés (un LECTEUR ne travaille pas les leads). */
const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MANAGER", "COMMERCIAL"];

/**
 * Commerciaux cibles de l'assignation (I-09) : permission `leads:assign` exigée, comptes actifs
 * et rôle habilité. Renvoie la liste ordonnée (une seule entrée en mode `single`).
 */
async function resolveAssignees(input: StartImportInput, role: Role): Promise<string[]> {
  const a = input.assignment;
  if (a.mode === "none") return [];
  if (!can(role, "leads:assign")) throw new ApiError(403, "Permission manquante : leads:assign", "forbidden");
  const ids = a.mode === "single" ? [a.userId] : Array.from(new Set(a.userIds));
  if (a.mode === "roundRobin" && ids.length < 2) {
    throw new ApiError(400, "La répartition à tour de rôle demande au moins deux commerciaux distincts", "invalid_assignees");
  }
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, role: { in: ASSIGNABLE_ROLES } },
    select: { id: true },
  });
  if (users.length !== ids.length) throw new ApiError(400, "Commercial cible invalide ou inactif", "invalid_assignee");
  return ids;
}

/** Lance le traitement après confirmation du mapping. */
export async function startImportJob(jobId: string, userId: string, input: StartImportInput, role: Role) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError(404, "Import introuvable", "not_found");
  if (job.userId !== userId) throw new ApiError(403, "Interdit", "forbidden");
  if (job.status !== "pending") throw new ApiError(409, "Import déjà en cours ou terminé", "conflict");

  // I-03 — colonnes obligatoires : choisies par l'utilisateur, sinon email (ou entreprise sans email).
  const mapped = Object.keys(input.mapping);
  const requiredFields = input.requiredFields ?? defaultRequiredFields(mapped);
  const unmapped = requiredFields.filter((f) => !input.mapping[f]);
  if (unmapped.length) {
    throw new ApiError(
      400,
      `Colonne obligatoire non mappée : ${unmapped.map((f) => IMPORTABLE_FIELD_LABELS[f]).join(", ")}`,
      "required_field_unmapped",
    );
  }
  const assigneeIds = await resolveAssignees(input, role);

  await prisma.importJob.update({
    where: { id: jobId },
    data: { mapping: { ...input, requiredFields } as object, status: "running" },
  });

  await enqueue("import-process", {
    importJobId: jobId,
    skipDuplicates: input.skipDuplicates,
    defaultSource: input.defaultSource,
    defaultTags: input.defaultTags,
    requiredFields,
    assignMode: input.assignment.mode,
    assigneeIds,
  });

  return prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
}

// La relation ImportJob.user est REQUISE au schéma : un `include: { user }`
// fait throw Prisma si le User a été supprimé (compte désactivé/purgé alors
// que l'historique d'import subsiste — cas réaliste en prod). On résout donc
// le user via une requête séparée, tolérante (null si absent).
async function attachUsers<T extends { userId: string }>(
  jobs: T[],
): Promise<(T & { user: { id: string; name: string } | null })[]> {
  const ids = [...new Set(jobs.map((j) => j.userId))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return jobs.map((j) => ({ ...j, user: byId.get(j.userId) ?? null }));
}

/** Retourne la liste des imports de l'utilisateur (ou tous pour ADMIN). */
export async function listImportJobs(userId: string, isAdmin: boolean) {
  const jobs = await prisma.importJob.findMany({
    where: isAdmin ? {} : { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return attachUsers(jobs);
}

/** Retourne le statut d'un import. */
export async function getImportJob(jobId: string, userId: string, isAdmin: boolean) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError(404, "Import introuvable", "not_found");
  if (!isAdmin && job.userId !== userId) throw new ApiError(403, "Interdit", "forbidden");
  const [withUser] = await attachUsers([job]);
  return withUser;
}

/** Supprime un import (et le fichier associé). */
export async function deleteImportJob(jobId: string, userId: string, isAdmin: boolean) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new ApiError(404, "Import introuvable", "not_found");
  if (!isAdmin && job.userId !== userId) throw new ApiError(403, "Interdit", "forbidden");
  if (job.status === "running") throw new ApiError(409, "Import en cours d'exécution", "conflict");
  if (job.filePath) {
    try { await fs.unlink(job.filePath); } catch { /* déjà supprimé */ }
  }
  await prisma.importJob.delete({ where: { id: jobId } });
}
