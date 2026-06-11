/**
 * Job `sequence-tick` — exécution des séquences de relance (RL-01 / RL-02).
 *
 * Pour chaque SequenceLead `active` dont `nextSendAt <= now` :
 *   1. Charge la Sequence et la liste de steps (JSON : [{ delayDays, templateId, stopOnReply }]).
 *   2. Vérifie les conditions d'arrêt RL-02 :
 *        - Lead supprimé / emailStatus UNSUBSCRIBED / HARD_BOUNCE / blacklisté → stop.
 *        - Si lead.lastReplyAt > sequenceLead.createdAt → reply reçue → stop (sauf stopOnReply=false).
 *        - currentStep >= maxSteps ou >= steps.length → completed.
 *        - Sequence.isPaused → laisser en active mais skipper l'envoi (RL-06 pause globale).
 *   3. Sinon : envoie l'email du step courant via le 1er SmtpConfig actif (rotation simple),
 *      personnalisation {{prenom}}/{{nom}}/{{entreprise}}, Message-ID stable (threading),
 *      sauvegarde InboxMessage outbound + EmailEvent SENT, log LeadHistory.
 *   4. Incrémente currentStep, calcule nextSendAt = now + nextStep.delayDays * 24h
 *      (ou status="completed" si plus de step).
 */
import * as crypto from "node:crypto";
import nodemailer from "nodemailer";
import { prisma, buildSmtpNodemailerAuth } from "@crm/db";
import type { WorkerJobContext } from "@crm/queue";
import { aiPersonalizeEmail } from "./ai";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const BATCH = 50;

function getEncKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return key;
}
function decrypt(payload: Buffer): string {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
function decryptOrNull(v: Buffer | Uint8Array | null | undefined): string | null {
  return v == null ? null : decrypt(Buffer.from(v));
}
function encryptValue(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

type StepConfig = {
  delayDays: number;
  templateId?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  stopOnReply?: boolean;
  /** A2 (F6) — réécriture IA unique par destinataire pour cette relance. */
  aiPersonalize?: boolean;
};

function parseSteps(raw: unknown): StepConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
    .map((s) => ({
      delayDays: Math.max(0, Number(s.delayDays ?? 0)),
      templateId: typeof s.templateId === "string" ? s.templateId : null,
      subject: typeof s.subject === "string" ? s.subject : null,
      bodyHtml: typeof s.bodyHtml === "string" ? s.bodyHtml : null,
      stopOnReply: s.stopOnReply == null ? true : Boolean(s.stopOnReply),
      aiPersonalize: Boolean(s.aiPersonalize),
    }));
}

function personalize(html: string, lead: { firstName: string | null; lastName: string | null; company: string | null; email: string | null }) {
  return html
    .replace(/\{\{prenom\}\}/gi, lead.firstName ?? "")
    .replace(/\{\{nom\}\}/gi, lead.lastName ?? "")
    .replace(/\{\{entreprise\}\}/gi, lead.company ?? "")
    .replace(/\{\{email\}\}/gi, lead.email ?? "");
}

async function stopSequenceLead(id: string, reason: string): Promise<void> {
  await prisma.sequenceLead.update({
    where: { id },
    data: { status: "stopped", stoppedReason: reason, nextSendAt: null },
  });
}

async function completeSequenceLead(id: string): Promise<void> {
  await prisma.sequenceLead.update({
    where: { id },
    data: { status: "completed", nextSendAt: null },
  });
}

async function pickActiveSmtp(ownerUserId: string | null) {
  if (!ownerUserId) return null;
  return prisma.smtpConfig.findFirst({
    where: { isActive: true, ownerUserId },
    orderBy: { sentToday: "asc" },
  });
}

type LeadRow = NonNullable<Awaited<ReturnType<typeof prisma.lead.findUnique>>>;

async function shouldStop(args: {
  lead: LeadRow;
  sequenceLeadCreatedAt: Date;
  step: StepConfig;
}): Promise<string | null> {
  const { lead, sequenceLeadCreatedAt, step } = args;
  if (lead.deletedAt) return "lead_deleted";
  if (lead.emailStatus === "UNSUBSCRIBED") return "unsubscribed";
  if (lead.emailStatus === "HARD_BOUNCE") return "hard_bounce";
  if (lead.emailHash) {
    const black = await prisma.blacklist.findUnique({ where: { emailHash: lead.emailHash } });
    if (black) return "blacklisted";
  }
  if (step.stopOnReply !== false && lead.lastReplyAt && lead.lastReplyAt > sequenceLeadCreatedAt) {
    return "reply";
  }
  return null;
}

async function sendStep(args: {
  sequenceLeadId: string;
  sequenceId: string;
  campaignId?: string | null;
  lead: LeadRow;
  step: StepConfig;
  stepIndex: number;
}): Promise<{ sent: boolean; error?: string }> {
  const { sequenceLeadId, sequenceId, campaignId, lead, step, stepIndex } = args;

  if (!lead.emailEnc) return { sent: false, error: "no_email" };
  const email = decryptOrNull(lead.emailEnc);
  if (!email) return { sent: false, error: "email_unreadable" };

  let subject = step.subject ?? null;
  let bodyHtml = step.bodyHtml ?? null;
  if (step.templateId) {
    const tpl = await prisma.template.findUnique({ where: { id: step.templateId } });
    if (!tpl) return { sent: false, error: "template_missing" };
    subject = subject ?? tpl.subject;
    bodyHtml = bodyHtml ?? tpl.bodyHtml;
  }
  if (!subject || !bodyHtml) return { sent: false, error: "step_incomplete" };

  const seqMeta = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    select: { createdById: true, config: true },
  });
  const smtpOwnerId = seqMeta?.createdById ?? lead.assignedToId;
  const seqConfig = seqMeta?.config as { smtpConfigId?: string | null } | null;
  let smtpRow = null;
  if (seqConfig?.smtpConfigId && smtpOwnerId) {
    smtpRow = await prisma.smtpConfig.findFirst({
      where: { id: seqConfig.smtpConfigId, isActive: true, ownerUserId: smtpOwnerId },
    });
  }
  if (!smtpRow) smtpRow = await pickActiveSmtp(smtpOwnerId);
  if (!smtpRow) return { sent: false, error: "no_smtp" };
  let smtpAuth: Awaited<ReturnType<typeof buildSmtpNodemailerAuth>>;
  try {
    smtpAuth = await buildSmtpNodemailerAuth(smtpRow, decryptOrNull);
  } catch {
    return { sent: false, error: "smtp_credentials_unreadable" };
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

  bodyHtml = personalize(bodyHtml, {
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email,
  });

  // A2 (F6) — réécriture IA unique par destinataire pour la relance.
  if (step.aiPersonalize) {
    const ai = await aiPersonalizeEmail({
      userId: smtpOwnerId,
      campaignId,
      sequenceId,
      subject,
      html: bodyHtml,
      lead: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        sector: lead.sector,
        city: lead.city,
        email,
      },
      enrichment: lead.enrichment,
      kind: "relance",
      stepIndex,
    });
    subject = ai.subject;
    bodyHtml = ai.html;
  }

  const senderDomain = (fromAddr.split("@")[1] ?? "crm").replace(/[^a-zA-Z0-9.\-]/g, "");
  const messageId = `<crm-seq-${sequenceId}-${lead.id}-${stepIndex}@${senderDomain}>`;
  const messageIdKey = messageId.replace(/^<|>$/g, "");

  // Récupère le précédent message du thread pour References (continuité du fil — RL-03)
  const lastOutbound = await prisma.inboxMessage.findFirst({
    where: { leadId: lead.id, direction: "outbound" },
    orderBy: { receivedAt: "desc" },
    select: { messageId: true },
  });
  const headers: Record<string, string> = {};
  if (lastOutbound?.messageId) {
    headers["In-Reply-To"] = `<${lastOutbound.messageId}>`;
    headers["References"] = `<${lastOutbound.messageId}>`;
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: email,
      subject,
      html: bodyHtml,
      messageId,
      headers,
    });
    await prisma.smtpConfig.update({
      where: { id: smtpRow.id },
      data: { sentToday: { increment: 1 } },
    });
    await prisma.emailEvent.create({
      data: {
        leadId: lead.id,
        sequenceId,
        eventType: "SENT",
        meta: { source: "sequence", stepIndex, messageId } as object,
      },
    });
    await prisma.inboxMessage.create({
      data: {
        leadId: lead.id,
        ownerUserId: smtpOwnerId,
        messageId: messageIdKey,
        inReplyTo: lastOutbound?.messageId ?? null,
        direction: "outbound",
        fromEnc: encryptValue(`"${fromName}" <${fromAddr}>`),
        toEnc: encryptValue(email),
        subject,
        bodyHtml,
        receivedAt: new Date(),
      },
    });
    await prisma.leadHistory.create({
      data: {
        leadId: lead.id,
        type: "sequence_step_sent",
        payload: { sequenceId, sequenceLeadId, stepIndex } as object,
      },
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.emailEvent.create({
      data: {
        leadId: lead.id,
        sequenceId,
        eventType: "BOUNCE",
        meta: { source: "sequence", stepIndex, error: msg, soft: true } as object,
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { emailStatus: "SOFT_BOUNCE" },
    });
    return { sent: false, error: msg };
  }
}

export async function runSequenceTick(_ctx: WorkerJobContext): Promise<unknown> {
  const now = new Date();
  const due = await prisma.sequenceLead.findMany({
    where: {
      status: "active",
      nextSendAt: { lte: now, not: null },
    },
    take: BATCH,
    orderBy: { nextSendAt: "asc" },
  });

  if (due.length === 0) return { ok: true, processed: 0 };

  let sent = 0;
  let stopped = 0;
  let completed = 0;
  let skipped = 0;

  for (const sl of due) {
    const sequence = await prisma.sequence.findUnique({ where: { id: sl.sequenceId } });
    if (!sequence) {
      await stopSequenceLead(sl.id, "sequence_missing");
      stopped++;
      continue;
    }
    if (sequence.isPaused) {
      skipped++;
      continue;
    }

    const steps = parseSteps(sequence.steps);
    const max = Math.min(sequence.maxSteps ?? steps.length, steps.length);
    if (sl.currentStep >= max) {
      await completeSequenceLead(sl.id);
      completed++;
      continue;
    }

    const step = steps[sl.currentStep];
    if (!step) {
      await completeSequenceLead(sl.id);
      completed++;
      continue;
    }

    const lead = await prisma.lead.findUnique({ where: { id: sl.leadId } });
    if (!lead) {
      await stopSequenceLead(sl.id, "lead_missing");
      stopped++;
      continue;
    }

    const stopReason = await shouldStop({ lead, sequenceLeadCreatedAt: sl.createdAt, step });
    if (stopReason) {
      await stopSequenceLead(sl.id, stopReason);
      stopped++;
      continue;
    }

    const result = await sendStep({
      sequenceLeadId: sl.id,
      sequenceId: sl.sequenceId,
      campaignId: sequence.campaignId,
      lead,
      step,
      stepIndex: sl.currentStep,
    });
    if (!result.sent) {
      // Erreur d'envoi : on stoppe avec la raison plutôt que boucler.
      await stopSequenceLead(sl.id, `send_failed:${result.error ?? "unknown"}`);
      stopped++;
      continue;
    }

    sent++;
    const nextIndex = sl.currentStep + 1;
    if (nextIndex >= max) {
      await prisma.sequenceLead.update({
        where: { id: sl.id },
        data: {
          currentStep: nextIndex,
          sentCount: { increment: 1 },
          status: "completed",
          nextSendAt: null,
        },
      });
      completed++;
    } else {
      const nextStep = steps[nextIndex];
      const delay = Math.max(0, (nextStep?.delayDays ?? 0)) * 24 * 3600 * 1000;
      await prisma.sequenceLead.update({
        where: { id: sl.id },
        data: {
          currentStep: nextIndex,
          sentCount: { increment: 1 },
          nextSendAt: new Date(Date.now() + delay),
        },
      });
    }
  }

  return { ok: true, processed: due.length, sent, stopped, completed, skipped };
}
