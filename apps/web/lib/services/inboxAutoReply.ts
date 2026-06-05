/**
 * Relance manuelle de l'auto-répondeur IA sur un message entrant déjà en base.
 */
import { prisma } from "@crm/db";
import { ApiError } from "@/lib/api";
import { categorizeReply, type ReplyCategory } from "@/lib/services/replyCategorizer";
import { maybeAutoRespond } from "../../../worker/src/autoResponder";

const VALID: ReadonlySet<ReplyCategory> = new Set([
  "interesse", "pas_interesse", "hors_sujet", "rappel", "auto_reply",
]);

function resultMessage(args: {
  acted: boolean;
  mode: string;
  reason?: string;
}): string {
  if (args.acted) {
    return args.mode === "auto"
      ? "Réponse IA envoyée au lead."
      : "Brouillon IA créé — consultez le fil de discussion.";
  }
  switch (args.reason) {
    case "disabled":
    case "assignee_disabled":
    case "no_responder_user":
      return "Auto-répondeur désactivé. Configurez-le dans Mon compte → Intégration IA.";
    case "category_skipped":
      return "Cette catégorie (hors sujet / auto-reply) ne déclenche pas de réponse IA.";
    case "no_email":
      return "Email du lead introuvable.";
    case "lead_missing":
      return "Lead introuvable.";
    default:
      return "Aucune réponse IA générée.";
  }
}

export async function retryInboxAutoReply(args: {
  inboxMessageId: string;
  sessionUserId: string;
}): Promise<{
  ok: boolean;
  acted: boolean;
  mode: string;
  message: string;
  category: ReplyCategory;
}> {
  const msg = await prisma.inboxMessage.findUnique({
    where: { id: args.inboxMessageId },
    include: { lead: { select: { id: true, assignedToId: true } } },
  });
  if (!msg) throw new ApiError(404, "Message introuvable", "not_found");
  if (msg.direction !== "inbound") {
    throw new ApiError(400, "Seuls les messages entrants peuvent déclencher une réponse IA.", "not_inbound");
  }
  if (!msg.leadId) {
    throw new ApiError(400, "Rattachez ce message à un lead avant de relancer l'IA.", "no_lead");
  }
  if (msg.isAutoReply) {
    throw new ApiError(400, "Les messages auto-reply ne sont pas traités par l'IA.", "auto_reply_message");
  }

  let category = (msg.category as ReplyCategory | null) ?? null;
  if (!category || !VALID.has(category)) {
    const openAiUserId = msg.lead?.assignedToId ?? args.sessionUserId;
    const recat = await categorizeReply({
      userId: openAiUserId,
      subject: msg.subject,
      bodyText: msg.bodyText,
      bodyHtml: msg.bodyHtml,
      isAutoReply: false,
    });
    category = recat.category;
    await prisma.inboxMessage.update({ where: { id: msg.id }, data: { category } });
  }

  const r = await maybeAutoRespond({
    leadId: msg.leadId,
    category,
    inboundSubject: msg.subject,
    inboundBodyText: msg.bodyText,
    inboundBodyHtml: msg.bodyHtml,
    inboundMessageId: msg.messageId,
  });

  return {
    ok: r.acted,
    acted: r.acted,
    mode: r.mode,
    message: resultMessage(r),
    category,
  };
}
