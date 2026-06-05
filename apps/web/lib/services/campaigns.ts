import { prisma } from "@crm/db";
import { ApiError } from "../api";
import { enqueue } from "../jobs";
import type { CreateCampaignInput, UpdateCampaignInput } from "../schemas/campaign";

const defaultStats = () =>
  ({
    sent: 0,
    failed: 0,
    opens: 0,
    clicks: 0,
    bounces: 0,
    unsubscribes: 0,
  }) as Record<string, number>;

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      template: { select: { id: true, name: true, subject: true } },
      segment: { select: { id: true, name: true } },
      smtpConfig: { select: { id: true, label: true, fromEmail: true } },
    },
  });
}

export async function getCampaign(id: string) {
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      segment: true,
      smtpConfig: { select: { id: true, label: true, fromEmail: true, dailyLimit: true, sentToday: true } },
    },
  });
  if (!c) throw new ApiError(404, "Campagne introuvable", "not_found");
  return c;
}

export async function createCampaign(input: CreateCampaignInput, createdById: string) {
  return prisma.campaign.create({
    data: {
      name: input.name,
      status: "DRAFT",
      templateId: input.templateId,
      segmentId: input.segmentId,
      smtpConfigId: input.smtpConfigId,
      subject: input.subject,
      scheduledAt: input.scheduledAt ?? null,
      dailyLimit: input.dailyLimit ?? null,
      stats: defaultStats() as object,
      ...(input.config != null ? { config: input.config as object } : {}),
      createdById,
    },
    include: {
      template: { select: { id: true, name: true } },
      segment: { select: { id: true, name: true } },
      smtpConfig: { select: { id: true, label: true } },
    },
  });
}

export async function updateCampaign(id: string, input: UpdateCampaignInput) {
  const cur = await getCampaign(id);
  if (cur.status !== "DRAFT" && cur.status !== "SCHEDULED" && cur.status !== "PAUSED") {
    throw new ApiError(409, "Campagne non modifiable dans cet état", "invalid_status");
  }
  return prisma.campaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      ...(input.segmentId !== undefined ? { segmentId: input.segmentId } : {}),
      ...(input.smtpConfigId !== undefined ? { smtpConfigId: input.smtpConfigId } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
      ...(input.config !== undefined ? { config: input.config as object } : {}),
    },
    include: {
      template: { select: { id: true, name: true } },
      segment: { select: { id: true, name: true } },
      smtpConfig: { select: { id: true, label: true } },
    },
  });
}

const DELETABLE_STATUSES = new Set(["DRAFT", "CANCELLED", "DONE", "PAUSED"]);

export async function deleteCampaign(id: string) {
  const cur = await getCampaign(id);
  if (!DELETABLE_STATUSES.has(cur.status)) {
    throw new ApiError(
      409,
      "Impossible de supprimer une campagne en cours d'envoi ou planifiée. Mettez-la en pause ou annulez-la d'abord.",
      "invalid_status",
    );
  }
  await prisma.$transaction([
    prisma.emailEvent.deleteMany({ where: { campaignId: id } }),
    prisma.campaign.delete({ where: { id } }),
  ]);
}

export async function pauseCampaign(id: string) {
  const cur = await getCampaign(id);
  if (!["SCHEDULED", "SENDING"].includes(cur.status)) {
    throw new ApiError(409, "Campagne non pausable", "invalid_status");
  }
  return prisma.campaign.update({ where: { id }, data: { status: "PAUSED" } });
}

export async function scheduleCampaign(id: string, scheduledAt?: Date) {
  const c = await getCampaign(id);
  if (c.status !== "DRAFT" && c.status !== "PAUSED") {
    throw new ApiError(409, "Seul un brouillon ou une campagne en pause peut être planifié", "invalid_status");
  }
  if (!c.templateId || !c.segmentId || !c.smtpConfigId || !c.subject?.trim()) {
    throw new ApiError(422, "Template, segment, SMTP et sujet requis", "incomplete_campaign");
  }
  const when = scheduledAt ?? c.scheduledAt ?? new Date();
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      status: "SCHEDULED",
      scheduledAt: when,
    },
  });
  await enqueue(
    "campaign-send",
    { campaignId: id, offset: 0 },
    { runAt: when > new Date() ? when : new Date(), priority: 2 },
  );
  return updated;
}

export async function resumeCampaign(id: string) {
  const cur = await getCampaign(id);
  if (cur.status !== "PAUSED") throw new ApiError(409, "Reprise impossible", "invalid_status");
  await prisma.campaign.update({ where: { id }, data: { status: "SENDING" } });
  await enqueue("campaign-send", { campaignId: id, offset: 0 }, { runAt: new Date(), priority: 2 });
  return getCampaign(id);
}

export type CampaignStatsAgg = {
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
};

export async function aggregateCampaignStats(campaignId: string): Promise<CampaignStatsAgg> {
  const g = await prisma.emailEvent.groupBy({
    by: ["eventType"],
    where: { campaignId },
    _count: { _all: true },
  });
  const n = (t: string) => g.find((x) => String(x.eventType) === t)?._count._all ?? 0;
  return {
    sent: n("SENT"),
    opens: n("OPEN"),
    clicks: n("CLICK"),
    bounces: n("BOUNCE"),
    unsubscribes: n("UNSUBSCRIBE"),
  };
}
