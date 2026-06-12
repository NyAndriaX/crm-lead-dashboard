import * as fs from "node:fs/promises";
import { z } from "zod";
import { handler, noContent, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteLeadDocument, getLeadDocumentFile } from "@/lib/services/leadDocuments";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const session = await requirePermission("leads:read");
  const { id, docId: rawDocId } = await params;
  const docId = z.string().min(1).parse(rawDocId);
  const { row } = await getLeadDocumentFile(id, docId, toScope(session));
  const buf = await fs.readFile(row.storagePath);
  return new Response(buf, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.fileName)}"`,
      "Content-Length": String(row.sizeBytes),
    },
  });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id, docId: rawDocId } = await params;
  const docId = z.string().min(1).parse(rawDocId);
  await deleteLeadDocument(id, docId, toScope(session), session.sub);
  await audit({
    userId: session.sub,
    action: "lead.document.delete",
    entityType: "Lead",
    entityId: id,
    ip: clientIp(req),
  });
  return noContent();
});
