/**
 * Réponse automatique par l'IA — réglages (Configuration › Intelligence artificielle) et brouillons.
 *
 * Mode « draft » : l'IA prépare la réponse (InboxMessage outbound isDraft) ; l'utilisateur l'envoie
 * (éventuellement modifiée) ou la supprime depuis la conversation. Mode « auto » : envoi direct
 * (packages/jobs/src/autoResponder.ts).
 */
import { createAccountTransport, prisma, syncPipelineStageForStatus } from "@crm/db";
import { ApiError } from "@/lib/api";
import { decryptOrNull, encryptOrNull } from "@/lib/crypto";

export type AutoReplyMode = "off" | "draft" | "auto";
export type AutoReplySettingsView = { mode: AutoReplyMode; meetingUrl: string | null; smtpConfigId: string | null };

const CONFIG_ID = "default";

export async function getAutoReplySettings(): Promise<AutoReplySettingsView> {
  const row = await prisma.aiConfig.findUnique({
    where: { id: CONFIG_ID },
    select: { autoReplyMode: true, autoReplyMeetingUrl: true, autoReplySmtpConfigId: true },
  });
  const mode = (["off", "draft", "auto"] as const).find((m) => m === row?.autoReplyMode) ?? "off";
  return { mode, meetingUrl: row?.autoReplyMeetingUrl ?? null, smtpConfigId: row?.autoReplySmtpConfigId ?? null };
}

export async function saveAutoReplySettings(input: AutoReplySettingsView, userId: string): Promise<AutoReplySettingsView> {
  if (input.smtpConfigId) {
    const acc = await prisma.smtpConfig.findUnique({ where: { id: input.smtpConfigId }, select: { id: true } });
    if (!acc) throw new ApiError(422, "Compte d'envoi introuvable", "invalid_smtp");
  }
  const data = {
    autoReplyMode: input.mode,
    autoReplyMeetingUrl: input.meetingUrl?.trim() || null,
    autoReplySmtpConfigId: input.smtpConfigId || null,
    updatedBy: userId,
  };
  await prisma.aiConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID, ...data }, update: data });
  return getAutoReplySettings();
}

async function pickSmtp(preferredId: string | null) {
  if (preferredId) {
    const row = await prisma.smtpConfig.findUnique({ where: { id: preferredId } });
    if (row?.isActive) return row;
  }
  return prisma.smtpConfig.findFirst({ where: { isActive: true }, orderBy: { sentToday: "asc" } });
}

async function loadDraft(id: string) {
  const msg = await prisma.inboxMessage.findUnique({ where: { id } });
  if (!msg || msg.direction !== "outbound") throw new ApiError(404, "Brouillon introuvable", "not_found");
  if (!msg.isDraft) throw new ApiError(409, "Ce message a déjà été envoyé", "not_a_draft");
  if (!msg.leadId) throw new ApiError(422, "Brouillon sans lead", "no_lead");
  return msg;
}

/** Envoie un brouillon IA (texte éventuellement modifié) avec le compte d'envoi des réponses automatiques. */
export async function sendAutoReplyDraft(id: string, edit: { subject?: string; bodyHtml?: string }, userId: string) {
  const msg = await loadDraft(id);
  const lead = await prisma.lead.findUnique({ where: { id: msg.leadId! } });
  if (!lead || lead.deletedAt) throw new ApiError(404, "Lead introuvable", "lead_not_found");
  const to = decryptOrNull(lead.emailEnc);
  if (!to) throw new ApiError(422, "Le lead n'a pas d'email", "no_email");

  const settings = await getAutoReplySettings();
  const smtp = await pickSmtp(settings.smtpConfigId);
  if (!smtp) throw new ApiError(422, "Aucun compte d'envoi actif (Configuration › Emailing)", "no_smtp");
  const login = decryptOrNull(smtp.loginEnc);
  const pass = decryptOrNull(smtp.passwordEnc);
  if (!login || !pass) throw new ApiError(500, "Identifiants du compte d'envoi illisibles", "smtp_unreadable");

  const subject = edit.subject?.trim() || msg.subject || "Re:";
  const html = edit.bodyHtml?.trim() || msg.bodyHtml || "";
  const fromAddr = smtp.fromEmail ?? login;
  const fromName = smtp.fromName ?? "CRM";
  const headers: Record<string, string> = {};
  if (msg.inReplyTo) {
    headers["In-Reply-To"] = `<${msg.inReplyTo}>`;
    headers["References"] = `<${msg.inReplyTo}>`;
  }

  try {
    await createAccountTransport({ host: smtp.host, port: smtp.port, login, pass }).sendMail({
      from: `"${fromName}" <${fromAddr}>`, to, subject, html, messageId: `<${msg.messageId}>`, headers,
    });
  } catch (e) {
    throw new ApiError(502, `Envoi impossible : ${e instanceof Error ? e.message : String(e)}`, "send_failed");
  }

  await prisma.inboxMessage.update({
    where: { id },
    data: { isDraft: false, subject, bodyHtml: html, fromEnc: encryptOrNull(`"${fromName}" <${fromAddr}>`)!, receivedAt: new Date() },
  });
  await prisma.smtpConfig.update({ where: { id: smtp.id }, data: { sentToday: { increment: 1 } } });
  if (msg.category === "pas_interesse" && lead.status !== "PERDU") {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "PERDU", lastActionAt: new Date() } });
    await syncPipelineStageForStatus(prisma, lead.id, "PERDU");
  }
  await prisma.leadHistory.create({
    data: { leadId: lead.id, userId, type: "auto_reply_sent", payload: { category: msg.category, validated: true, edited: !!(edit.subject || edit.bodyHtml) } as object },
  });
  return { sent: true };
}

export async function discardAutoReplyDraft(id: string, userId: string) {
  const msg = await loadDraft(id);
  await prisma.inboxMessage.delete({ where: { id } });
  await prisma.leadHistory.create({
    data: { leadId: msg.leadId!, userId, type: "auto_reply_discarded", payload: { category: msg.category } as object },
  });
}
