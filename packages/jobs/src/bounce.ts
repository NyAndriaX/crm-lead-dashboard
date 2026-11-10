/**
 * M-11 — Application d'un rapport de non-remise (DSN) relevé par `imap-sync`.
 *
 *  1. Retrouve l'envoi d'origine : Message-ID du CRM (campagne / séquence) → message sortant de l'inbox
 *     → à défaut, adresse du destinataire en échec → emailHash du lead.
 *  2. Enregistre un événement BOUNCE (meta : source "dsn", type hard/soft, statut, diagnostic sans PII).
 *  3. Met le lead en HARD_BOUNCE ou SOFT_BOUNCE (jamais de rétrogradation d'un HARD_BOUNCE / UNSUBSCRIBED).
 *  4. Rejet définitif : inscription en liste noire (`blacklist`, raison "hard_bounce") et arrêt des séquences.
 *  5. Trois échecs temporaires signalés par DSN pour un même lead → traités comme un rejet définitif.
 *
 * Idempotent : un même DSN (Message-ID) n'est appliqué qu'une fois.
 */
import { prisma } from "@crm/db";
import { parseCrmMessageId, type BounceType, type DsnReport } from "./dsn";

/** Nombre d'échecs temporaires (DSN) au-delà duquel l'adresse est considérée comme invalide. */
export const SOFT_BOUNCE_ESCALATION = 3;

type Origin = {
  leadId: string;
  campaignId: string | null;
  sequenceId: string | null;
  variant: string | null;
  originalMessageId: string | null;
  matchedBy: "message_id" | "inbox_thread" | "recipient";
};

async function resolveOrigin(report: DsnReport, hashEmail: (email: string) => string): Promise<Origin | null> {
  // 1. Message-ID émis par le CRM : il encode la campagne (ou la séquence) et le lead.
  for (const id of report.originalMessageIds) {
    const ref = parseCrmMessageId(id);
    if (!ref) continue;
    const lead = await prisma.lead.findUnique({ where: { id: ref.leadId }, select: { id: true } });
    if (!lead) continue;
    let campaignId: string | null = null;
    if (ref.kind === "campaign") {
      const c = await prisma.campaign.findUnique({ where: { id: ref.campaignId }, select: { id: true } });
      campaignId = c?.id ?? null;
    }
    return {
      leadId: lead.id,
      campaignId,
      sequenceId: ref.kind === "sequence" ? ref.sequenceId : null,
      variant: ref.kind === "campaign" ? ref.variant : null,
      originalMessageId: id,
      matchedBy: "message_id",
    };
  }
  // 2. Message sortant connu de l'inbox (envois manuels, auto-réponses…).
  if (report.originalMessageIds.length > 0) {
    const out = await prisma.inboxMessage.findFirst({
      where: { messageId: { in: report.originalMessageIds }, direction: "outbound", leadId: { not: null } },
      select: { leadId: true, messageId: true },
    });
    if (out?.leadId) {
      return { leadId: out.leadId, campaignId: null, sequenceId: null, variant: null, originalMessageId: out.messageId, matchedBy: "inbox_thread" };
    }
  }
  // 3. Destinataire en échec → emailHash.
  if (report.recipient) {
    const lead = await prisma.lead.findFirst({
      where: { emailHash: hashEmail(report.recipient), deletedAt: null },
      select: { id: true },
    });
    if (lead) {
      return { leadId: lead.id, campaignId: null, sequenceId: null, variant: null, originalMessageId: report.originalMessageIds[0] ?? null, matchedBy: "recipient" };
    }
  }
  return null;
}

export type BounceOutcome =
  | { applied: false; reason: "success_dsn" | "duplicate" | "no_lead" }
  | { applied: true; leadId: string; bounceType: BounceType; escalated: boolean; blacklisted: boolean; sequencesStopped: number; campaignId: string | null };

export async function applyBounce(
  report: DsnReport,
  ctx: { dsnMessageId: string | null; receivedAt: Date; hashEmail: (email: string) => string },
): Promise<BounceOutcome> {
  if (!report.bounceType) return { applied: false, reason: "success_dsn" };

  if (ctx.dsnMessageId) {
    const dup = await prisma.emailEvent.findFirst({
      where: { eventType: "BOUNCE", meta: { path: "$.dsnMessageId", equals: ctx.dsnMessageId } },
      select: { id: true },
    });
    if (dup) return { applied: false, reason: "duplicate" };
  }

  const origin = await resolveOrigin(report, ctx.hashEmail);
  if (!origin) return { applied: false, reason: "no_lead" };

  let bounceType: BounceType = report.bounceType;
  let escalated = false;
  if (bounceType === "soft") {
    const previousSoft = await prisma.emailEvent.count({
      where: {
        leadId: origin.leadId,
        eventType: "BOUNCE",
        AND: [
          { meta: { path: "$.source", equals: "dsn" } },
          { meta: { path: "$.bounceType", equals: "soft" } },
        ],
      },
    });
    if (previousSoft + 1 >= SOFT_BOUNCE_ESCALATION) {
      bounceType = "hard";
      escalated = true;
    }
  }

  const lead = await prisma.lead.findUnique({
    where: { id: origin.leadId },
    select: { id: true, emailHash: true, emailStatus: true },
  });
  if (!lead) return { applied: false, reason: "no_lead" };

  await prisma.emailEvent.create({
    data: {
      leadId: lead.id,
      campaignId: origin.campaignId,
      sequenceId: origin.sequenceId,
      eventType: "BOUNCE",
      occurredAt: ctx.receivedAt,
      meta: {
        source: "dsn",
        bounceType,
        reportedType: report.bounceType,
        escalated,
        status: report.status,
        action: report.action,
        smtpCode: report.smtpCode,
        diagnostic: report.diagnostic,
        reason: escalated ? `${SOFT_BOUNCE_ESCALATION} échecs temporaires : adresse considérée comme invalide` : report.reason,
        variant: origin.variant,
        originalMessageId: origin.originalMessageId,
        dsnMessageId: ctx.dsnMessageId,
        matchedBy: origin.matchedBy,
      } as object,
    },
  });

  const keepStatus = lead.emailStatus === "HARD_BOUNCE" || lead.emailStatus === "UNSUBSCRIBED";
  if (bounceType === "hard" && lead.emailStatus !== "UNSUBSCRIBED") {
    await prisma.lead.update({ where: { id: lead.id }, data: { emailStatus: "HARD_BOUNCE" } });
  } else if (bounceType === "soft" && !keepStatus) {
    await prisma.lead.update({ where: { id: lead.id }, data: { emailStatus: "SOFT_BOUNCE" } });
  }

  let blacklisted = false;
  let sequencesStopped = 0;
  if (bounceType === "hard") {
    if (lead.emailHash) {
      await prisma.blacklist.upsert({
        where: { emailHash: lead.emailHash },
        create: { emailHash: lead.emailHash, reason: "hard_bounce" },
        update: {}, // une inscription antérieure (désabonnement, manuelle) garde sa raison
      });
      blacklisted = true;
    }
    const stopped = await prisma.sequenceLead.updateMany({
      where: { leadId: lead.id, status: { in: ["active", "paused"] } },
      data: { status: "stopped", stoppedReason: "hard_bounce" },
    });
    sequencesStopped = stopped.count;
  }

  if (origin.campaignId) {
    const cur = await prisma.campaign.findUnique({ where: { id: origin.campaignId }, select: { stats: true } });
    const stats = cur?.stats && typeof cur.stats === "object" && !Array.isArray(cur.stats) ? { ...(cur.stats as Record<string, number>) } : {};
    stats.bounces = (stats.bounces ?? 0) + 1;
    await prisma.campaign.update({ where: { id: origin.campaignId }, data: { stats: stats as object } });
  }

  await prisma.leadHistory.create({
    data: {
      leadId: lead.id,
      type: "email_bounced",
      payload: {
        bounceType,
        escalated,
        status: report.status,
        campaignId: origin.campaignId,
        sequenceId: origin.sequenceId,
        blacklisted,
        sequencesStopped,
      } as object,
    },
  });

  return { applied: true, leadId: lead.id, bounceType, escalated, blacklisted, sequencesStopped, campaignId: origin.campaignId };
}
