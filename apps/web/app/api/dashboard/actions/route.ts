/**
 * GET /api/dashboard/actions — « À traiter maintenant » : ce qui attend une décision humaine.
 * Les compteurs suivent les droits : un COMMERCIAL ne voit que ses leads.
 */
import { prisma } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";
import { NOT_DELETED } from "@/lib/notDeleted";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export const GET = handler(async () => {
  const session = await requireSession();
  const mine = session.role === "COMMERCIAL" ? { assignedToId: session.sub } : {};
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const staleSince = new Date(now.getTime() - 7 * DAY);

  const [hotReplies, toValidate, hotIdle, unassignedHot, sendsToday, drafts, paused] = await Promise.all([
    prisma.inboxMessage.count({
      where: { direction: "inbound", isRead: false, category: { in: ["interesse", "rappel"] }, lead: { ...NOT_DELETED, ...mine } },
    }),
    session.role === "COMMERCIAL" ? Promise.resolve(0) : prisma.scrapedLeadBuffer.count({ where: { status: "pending" } }),
    prisma.lead.count({
      where: {
        ...NOT_DELETED, ...mine, score: { gte: 70 }, status: { in: ["NOUVEAU", "CONTACTE", "QUALIFIE"] },
        OR: [{ lastActionAt: null }, { lastActionAt: { lt: staleSince } }],
      },
    }),
    session.role === "COMMERCIAL" ? Promise.resolve(0) : prisma.lead.count({ where: { ...NOT_DELETED, score: { gte: 70 }, assignedToId: null } }),
    prisma.sequenceLead.count({ where: { status: "active", nextSendAt: { lt: endOfDay }, sequence: { isPaused: false }, lead: { ...NOT_DELETED, ...mine } } }),
    prisma.campaign.count({ where: { status: "DRAFT" } }),
    prisma.campaign.count({ where: { status: "PAUSED" } }),
  ]);

  return json({ data: { hotReplies, toValidate, hotIdle, unassignedHot, sendsToday, drafts, paused } });
});
