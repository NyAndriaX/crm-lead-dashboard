import { z } from "zod";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { assignInboxToLead, getInboxMessage, markInboxRead } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  leadId: z.string().trim().min(1).nullable().optional(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("inbox:read");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const msg = await getInboxMessage(id);
  if (!msg) throw new ApiError(404, "Message introuvable", "not_found");
  return json({ data: msg });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  await requirePermission("inbox:read");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, patchSchema);
  if (input.isRead !== undefined) {
    await markInboxRead(id, input.isRead);
  }
  if (input.leadId !== undefined) {
    await assignInboxToLead(id, input.leadId);
  }
  const updated = await getInboxMessage(id);
  return json({ data: updated });
});
