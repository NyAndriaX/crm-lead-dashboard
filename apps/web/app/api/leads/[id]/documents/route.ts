import { handler, json, created, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { addLeadDocument, listLeadDocuments } from "@/lib/services/leadDocuments";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const session = await requirePermission("leads:read");
  const { id } = await params;
  return json({ data: await listLeadDocuments(id, toScope(session)) });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    const { ApiError } = await import("@/lib/api");
    throw new ApiError(400, "Fichier manquant", "missing_file");
  }
  const doc = await addLeadDocument(id, file, toScope(session), session.sub);
  await audit({
    userId: session.sub,
    action: "lead.document.upload",
    entityType: "Lead",
    entityId: id,
    ip: clientIp(req),
  });
  return created({ data: doc });
});
