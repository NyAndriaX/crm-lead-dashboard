import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { prisma } from "@crm/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("leads:read");
  const { id: rawId } = await params;
  const leadId = z.string().min(1).parse(rawId);

  const events = await prisma.emailEvent.findMany({
    where: { leadId },
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: {
      campaign: { select: { id: true, name: true, status: true, subject: true } },
    },
  });

  const byCampaign = new Map<string, {
    campaignId: string;
    campaignName: string;
    campaignStatus: string;
    subject: string | null;
    sentAt: string | null;
    opens: number;
    clicks: number;
    lastEventAt: string;
  }>();

  for (const e of events) {
    if (!e.campaignId || !e.campaign) continue;
    const cur = byCampaign.get(e.campaignId) ?? {
      campaignId: e.campaignId,
      campaignName: e.campaign.name,
      campaignStatus: e.campaign.status,
      subject: e.campaign.subject,
      sentAt: null,
      opens: 0,
      clicks: 0,
      lastEventAt: e.occurredAt.toISOString(),
    };
    if (e.eventType === "SENT" && !cur.sentAt) cur.sentAt = e.occurredAt.toISOString();
    if (e.eventType === "OPEN") cur.opens += 1;
    if (e.eventType === "CLICK") cur.clicks += 1;
    if (e.occurredAt.toISOString() > cur.lastEventAt) cur.lastEventAt = e.occurredAt.toISOString();
    byCampaign.set(e.campaignId, cur);
  }

  const seqLeads = await prisma.sequenceLead.findMany({
    where: { leadId },
    include: { sequence: { select: { id: true, name: true, isPaused: true } } },
  });

  return json({
    data: {
      campaigns: Array.from(byCampaign.values()),
      sequences: seqLeads.map((s) => ({
        sequenceId: s.sequenceId,
        name: s.sequence.name,
        status: s.status,
        sequencePaused: s.sequence.isPaused,
        sentCount: s.sentCount,
        currentStep: s.currentStep,
      })),
    },
  });
});
