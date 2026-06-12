/**
 * POST /api/inbox/:id/categorize — re-catégorisation manuelle d'un message
 * inbound (R-04). Recalcule la catégorie via OpenAI ou heuristique, ou
 * applique la catégorie passée explicitement en body.
 */
import { z } from "zod";
import { prisma, strictOwnerWhere } from "@crm/db";
import { handler, json, parseBody, requirePermission, ApiError } from "@/lib/api";
import { categorizeReply, type ReplyCategory } from "@/lib/services/replyCategorizer";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  category: z.enum(["interesse", "pas_interesse", "hors_sujet", "rappel", "auto_reply"]).optional(),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("inbox:reply");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, bodySchema).catch(() => ({ category: undefined }));

  const msg = await prisma.inboxMessage.findFirst({
    where: { id, ...strictOwnerWhere(session.sub) },
    include: { lead: { select: { assignedToId: true } } },
  });
  if (!msg) throw new ApiError(404, "Message introuvable", "not_found");
  if (msg.direction !== "inbound") {
    throw new ApiError(400, "Seuls les messages entrants peuvent être catégorisés", "not_inbound");
  }

  const openAiUserId = msg.lead?.assignedToId ?? session.sub;

  let category: ReplyCategory;
  let source: "ai" | "heuristic" | "manual" = "manual";
  if (input.category) {
    category = input.category;
  } else {
    const result = await categorizeReply({
      userId: openAiUserId,
      subject: msg.subject,
      bodyText: msg.bodyText,
      bodyHtml: msg.bodyHtml,
      isAutoReply: msg.isAutoReply,
    });
    category = result.category;
    source = result.source;
  }

  await prisma.inboxMessage.update({ where: { id }, data: { category } });
  return json({ data: { id, category, source } });
});
