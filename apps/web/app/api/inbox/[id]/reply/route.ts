import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma, buildSmtpNodemailerAuth } from "@crm/db";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { decryptOrNull, encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const replySchema = z.object({
  smtpConfigId: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(500),
  bodyHtml: z.string().min(1).max(200_000),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("inbox:reply");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, replySchema);

  const original = await prisma.inboxMessage.findUnique({
    where: { id },
    include: { lead: { select: { id: true, emailEnc: true } } },
  });
  if (!original) throw new ApiError(404, "Message introuvable", "not_found");
  if (original.direction !== "inbound") {
    throw new ApiError(400, "On ne répond qu'à un message entrant", "invalid_target");
  }

  // Destinataire : email du lead si associé, sinon expéditeur déchiffré de l'inbound.
  let toEmail: string | null = null;
  if (original.lead?.emailEnc) {
    toEmail = decryptOrNull(original.lead.emailEnc);
  }
  if (!toEmail) {
    const fromRaw = decryptOrNull(original.fromEnc);
    const match = fromRaw?.match(/<([^>]+)>/) ?? null;
    toEmail = match ? match[1] ?? null : fromRaw;
  }
  if (!toEmail) throw new ApiError(400, "Destinataire indéterminable", "no_recipient");

  const smtpRow = await prisma.smtpConfig.findFirst({
    where: { id: input.smtpConfigId, ownerUserId: session.sub },
  });
  if (!smtpRow) throw new ApiError(404, "SMTP introuvable", "smtp_not_found");
  let smtpAuth: Awaited<ReturnType<typeof buildSmtpNodemailerAuth>>;
  try {
    smtpAuth = await buildSmtpNodemailerAuth(smtpRow, decryptOrNull);
  } catch {
    throw new ApiError(500, "Identifiants SMTP illisibles", "smtp_unreadable");
  }
  const login = decryptOrNull(smtpRow.loginEnc);
  const fromAddr = smtpRow.fromEmail ?? smtpRow.oauthMailSender ?? login ?? "no-reply@crm";
  const fromName = smtpRow.fromName ?? "CRM";

  const transporter = nodemailer.createTransport({
    host: smtpRow.host,
    port: smtpRow.port,
    secure: smtpRow.port === 465,
    auth: smtpAuth,
    tls: { rejectUnauthorized: false },
  });

  // Threading : reprend la chaîne References + ajoute le messageId du message auquel on répond.
  const senderDomain = (fromAddr.split("@")[1] ?? "crm").replace(/[^a-zA-Z0-9.\-]/g, "");
  const newMessageId = `<crm-reply-${id}-${Date.now()}@${senderDomain}>`;
  const newMessageIdKey = newMessageId.replace(/^<|>$/g, "");
  const references = [original.inReplyTo, original.messageId].filter(Boolean).map((m) => `<${m}>`).join(" ");
  const headers: Record<string, string> = {
    "In-Reply-To": `<${original.messageId}>`,
  };
  if (references) headers["References"] = references;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: toEmail,
      subject: input.subject,
      html: input.bodyHtml,
      messageId: newMessageId,
      headers,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(502, `Échec d'envoi SMTP : ${msg}`, "smtp_send_failed");
  }

  await prisma.smtpConfig.update({
    where: { id: smtpRow.id },
    data: { sentToday: { increment: 1 } },
  });
  await prisma.inboxMessage.update({
    where: { id },
    data: { isRead: true },
  });
  const saved = await prisma.inboxMessage.create({
    data: {
      leadId: original.leadId,
      ownerUserId: session.sub,
      messageId: newMessageIdKey,
      inReplyTo: original.messageId,
      direction: "outbound",
      fromEnc: encrypt(`"${fromName}" <${fromAddr}>`),
      toEnc: encrypt(toEmail),
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      receivedAt: new Date(),
    },
  });
  if (original.leadId) {
    await prisma.leadHistory.create({
      data: {
        leadId: original.leadId,
        type: "manual_reply_sent",
        payload: { repliedTo: id, messageId: newMessageIdKey } as object,
      },
    });
  }

  return json({ data: { id: saved.id, messageId: newMessageIdKey } });
});
