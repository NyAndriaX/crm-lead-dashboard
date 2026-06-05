import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { retryInboxAutoReply } from "@/lib/services/inboxAutoReply";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/inbox/:id/auto-reply — relance l'auto-répondeur IA sur un message entrant. */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const session = await requirePermission("inbox:reply");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await retryInboxAutoReply({ inboxMessageId: id, sessionUserId: session.sub });
  return json({ data });
});
