import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { assignInboxToLead, deleteInboxMessage, getInboxMessage, markInboxRead } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  leadId: z.string().trim().min(1).nullable().optional(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("inbox:read");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const msg = await getInboxMessage(id, scope);
  if (!msg) throw new ApiError(404, "Message introuvable", "not_found");
  return json({ data: msg });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("inbox:read");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, patchSchema);
  if (input.isRead !== undefined) {
    await markInboxRead(id, input.isRead, scope);
  }
  if (input.leadId !== undefined) {
    await assignInboxToLead(id, input.leadId, scope);
  }
  const updated = await getInboxMessage(id, scope);
  return json({ data: updated });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("inbox:reply");
  const scope = toScope(s);
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteInboxMessage(id, scope);
  return json({ ok: true });
});
