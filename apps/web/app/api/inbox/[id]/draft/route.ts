/**
 * POST   /api/inbox/:id/draft — envoie le brouillon de réponse IA (objet / texte modifiables).
 * DELETE /api/inbox/:id/draft — supprime le brouillon.
 */
import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { discardAutoReplyDraft, sendAutoReplyDraft } from "@/lib/services/autoReply";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const sendSchema = z.object({
  subject: z.string().trim().max(300).optional(),
  bodyHtml: z.string().max(200_000).optional(),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("inbox:reply");
  const { id } = await params;
  const body = await parseBody(req, sendSchema);
  const res = await sendAutoReplyDraft(id, body, s.sub);
  await audit({ userId: s.sub, action: "inbox.draft.send", entityType: "InboxMessage", entityId: id, ip: clientIp(req) });
  return json({ data: res });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("inbox:reply");
  const { id } = await params;
  await discardAutoReplyDraft(id, s.sub);
  await audit({ userId: s.sub, action: "inbox.draft.discard", entityType: "InboxMessage", entityId: id, ip: clientIp(req) });
  return noContent();
});
