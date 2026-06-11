import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { retryInboxAutoReply } from "@/lib/services/inboxAutoReply";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  knowledgeBaseId: z.string().trim().min(1).nullable().optional(),
});

/** POST /api/inbox/:id/auto-reply — relance l'auto-répondeur IA sur un message entrant. */
export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("inbox:reply");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  let knowledgeBaseId: string | null = null;
  try {
    const body = await parseBody(req, bodySchema);
    knowledgeBaseId = body.knowledgeBaseId ?? null;
  } catch {
    /* corps vide accepté */
  }
  const data = await retryInboxAutoReply({
    inboxMessageId: id,
    sessionUserId: session.sub,
    knowledgeBaseId,
  });
  return json({ data });
});
