import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma, assertLeadAccess, type DataScope } from "@crm/db";
import { ApiError } from "@/lib/api";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);

function leadsUploadDir(): string {
  const base = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  return path.join(base, "leads");
}

export type LeadDocumentDTO = {
  id: string;
  leadId: string;
  userId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

async function assertLead(scope: DataScope, id: string) {
  try {
    await assertLeadAccess(scope, id);
  } catch {
    throw new ApiError(404, "Lead introuvable", "not_found");
  }
  const lead = await prisma.lead.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!lead || lead.deletedAt) throw new ApiError(404, "Lead introuvable", "not_found");
}

export async function listLeadDocuments(leadId: string, scope: DataScope): Promise<LeadDocumentDTO[]> {
  await assertLead(scope, leadId);
  const rows = await prisma.leadDocument.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    userId: r.userId,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
  }));
}

export async function addLeadDocument(
  leadId: string,
  file: File,
  scope: DataScope,
  actorId?: string,
): Promise<LeadDocumentDTO> {
  await assertLead(scope, leadId);
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new ApiError(400, `Fichier invalide (max ${MAX_BYTES / 1024 / 1024} Mo)`, "file_too_large");
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    throw new ApiError(400, "Type de fichier non autorisé", "invalid_mime");
  }

  const dir = path.join(leadsUploadDir(), leadId);
  await fs.mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
  const stored = `${Date.now()}-${randomUUID()}-${safeName}`;
  const storagePath = path.join(dir, stored);
  await fs.writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

  const row = await prisma.leadDocument.create({
    data: {
      leadId,
      userId: actorId ?? null,
      fileName: safeName,
      mimeType: mime,
      sizeBytes: file.size,
      storagePath,
    },
  });

  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: actorId ?? null,
      type: "document_added",
      payload: { documentId: row.id, fileName: safeName } as object,
    },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActionAt: new Date() } });

  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

export async function getLeadDocumentFile(
  leadId: string,
  docId: string,
  scope: DataScope,
): Promise<{ row: LeadDocumentDTO & { storagePath: string } }> {
  await assertLead(scope, leadId);
  const row = await prisma.leadDocument.findFirst({ where: { id: docId, leadId } });
  if (!row) throw new ApiError(404, "Document introuvable", "not_found");
  return {
    row: {
      id: row.id,
      leadId: row.leadId,
      userId: row.userId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      storagePath: row.storagePath,
    },
  };
}

export async function deleteLeadDocument(
  leadId: string,
  docId: string,
  scope: DataScope,
  actorId?: string,
): Promise<void> {
  const { row } = await getLeadDocumentFile(leadId, docId, scope);
  await prisma.leadDocument.delete({ where: { id: docId } });
  await fs.unlink(row.storagePath).catch(() => {});
  await prisma.leadHistory.create({
    data: {
      leadId,
      userId: actorId ?? null,
      type: "document_deleted",
      payload: { documentId: docId, fileName: row.fileName } as object,
    },
  });
}
