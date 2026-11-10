import { AB_RULES, abVerdict, aggregateAbVariants, prisma, type AbEvent, type AbVariantStats, type AbVerdict } from "@crm/db";
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
  const [rows, metrics] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        template: { select: { id: true, name: true, subject: true } },
        segment: { select: { id: true, name: true } },
        smtpConfig: { select: { id: true, label: true, fromEmail: true } },
      },
    }),
    allCampaignMetrics(),
  ]);
  return rows.map((r) => ({ ...r, metrics: metrics.get(r.id) ?? emptyAgg() }));
}

const emptyAgg = (): CampaignStatsAgg => ({ sent: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0, replies: 0 });

const AGG_KEY: Record<string, keyof CampaignStatsAgg> = {
  SENT: "sent", OPEN: "opens", CLICK: "clicks", BOUNCE: "bounces", UNSUBSCRIBE: "unsubscribes", REPLIED: "replies",
};

/** Métriques (contacts uniques) de toutes les campagnes en une seule requête groupée. */
async function allCampaignMetrics(): Promise<Map<string, CampaignStatsAgg>> {
  const groups = await prisma.emailEvent.groupBy({
    by: ["campaignId", "eventType", "leadId"],
    where: { campaignId: { not: null } },
    _count: { _all: true },
  });
  const out = new Map<string, CampaignStatsAgg>();
  for (const g of groups) {
    const key = AGG_KEY[String(g.eventType)];
    if (!g.campaignId || !key) continue;
    const agg = out.get(g.campaignId) ?? emptyAgg();
    agg[key] += 1;
    out.set(g.campaignId, agg);
  }
  return out;
}

export async function getCampaign(id: string) {
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      segment: true,
      smtpConfig: { select: { id: true, label: true, fromName: true, fromEmail: true, dailyLimit: true, sentToday: true } },
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

export async function deleteCampaign(id: string) {
  const cur = await getCampaign(id);
  if (!["DRAFT", "CANCELLED"].includes(cur.status)) {
    throw new ApiError(409, "Seules les campagnes brouillon ou annulées peuvent être supprimées", "invalid_status");
  }
  await prisma.campaign.delete({ where: { id } });
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
  replies: number;
};

/** Compteurs par contact unique (un lead qui ouvre 3 fois compte une ouverture) : taux toujours ≤ 100 %. */
export async function aggregateCampaignStats(campaignId: string): Promise<CampaignStatsAgg> {
  const g = await prisma.emailEvent.groupBy({
    by: ["eventType", "leadId"],
    where: { campaignId },
    _count: { _all: true },
  });
  const n = (t: string) => g.filter((x) => String(x.eventType) === t).length;
  return {
    sent: n("SENT"),
    opens: n("OPEN"),
    clicks: n("CLICK"),
    bounces: n("BOUNCE"),
    unsubscribes: n("UNSUBSCRIBE"),
    replies: n("REPLIED"),
  };
}

export type CampaignAbComparison = {
  splitPercent: number;
  subjects: { A: string | null; B: string | null };
  variants: AbVariantStats[];
  verdict: AbVerdict;
  rules: { minSentPerVariant: number; zThreshold: number; minGapPts: { replyRate: number; openRate: number } };
};

const variantOf = (meta: unknown): string | null => {
  const v = meta && typeof meta === "object" ? (meta as { variant?: unknown }).variant : null;
  return typeof v === "string" ? v : null;
};

/**
 * M-13 — Comparatif des variantes A/B (null si la campagne n'est pas en test A/B et n'a rien envoyé en B).
 * Réponses : événements REPLIED rattachés à la campagne (threading, cf. imap-sync) et, pour l'historique,
 * réponses non rattachées (ni campagne ni séquence) d'un destinataire reçues après son envoi.
 */
export async function campaignAbComparison(campaignId: string): Promise<CampaignAbComparison | null> {
  const c = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { subject: true, config: true, template: { select: { subject: true } } },
  });
  if (!c) return null;
  const ab = ((c.config ?? {}) as { ab?: { enabled?: boolean; subjectB?: string | null; splitPercent?: number } }).ab;
  const sentRows = await prisma.emailEvent.findMany({
    where: { campaignId, eventType: "SENT" },
    select: { leadId: true, meta: true, occurredAt: true },
  });
  const hasB = sentRows.some((r) => variantOf(r.meta) === "B");
  if (!ab?.enabled && !hasB) return null;

  const firstSent = new Map<string, Date>();
  for (const r of sentRows) {
    if (r.leadId && (!firstSent.has(r.leadId) || r.occurredAt < firstSent.get(r.leadId)!)) firstSent.set(r.leadId, r.occurredAt);
  }
  const [linked, legacyReplies] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { campaignId, eventType: { in: ["OPEN", "CLICK", "REPLIED", "BOUNCE", "UNSUBSCRIBE"] } },
      select: { leadId: true, eventType: true, meta: true },
    }),
    firstSent.size > 0
      ? prisma.emailEvent.findMany({
          where: { eventType: "REPLIED", campaignId: null, sequenceId: null, leadId: { in: [...firstSent.keys()] } },
          select: { leadId: true, occurredAt: true },
        })
      : Promise.resolve([]),
  ]);
  const events: AbEvent[] = linked.map((e) => ({ leadId: e.leadId, eventType: String(e.eventType), variant: variantOf(e.meta) }));
  for (const r of legacyReplies) {
    if (r.leadId && r.occurredAt >= firstSent.get(r.leadId)!) events.push({ leadId: r.leadId, eventType: "REPLIED" });
  }
  const stats = aggregateAbVariants(
    sentRows.map((r) => ({ leadId: r.leadId, eventType: "SENT", variant: variantOf(r.meta) })),
    events,
  );
  const subjectA = c.subject ?? c.template?.subject ?? null;
  return {
    splitPercent: ab?.splitPercent ?? 50,
    subjects: { A: subjectA, B: ab?.subjectB?.trim() ? ab.subjectB : subjectA },
    variants: [stats.A, stats.B],
    verdict: abVerdict(stats.A, stats.B),
    rules: { minSentPerVariant: AB_RULES.minSentPerVariant, zThreshold: AB_RULES.zThreshold, minGapPts: { ...AB_RULES.minGapPts } as CampaignAbComparison["rules"]["minGapPts"] },
  };
}

const ACTIVITY_TYPES = ["SENT", "OPEN", "CLICK", "REPLIED", "BOUNCE", "UNSUBSCRIBE"] as const;

/** Série quotidienne des événements + derniers événements (avec le lead) d'une campagne. */
export async function campaignActivity(campaignId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [events, recent] = await Promise.all([
    prisma.emailEvent.findMany({
      where: { campaignId, occurredAt: { gte: since } },
      select: { eventType: true, occurredAt: true },
    }),
    prisma.emailEvent.findMany({
      where: { campaignId, eventType: { in: [...ACTIVITY_TYPES] } },
      orderBy: { occurredAt: "desc" },
      take: 25,
      select: {
        id: true, eventType: true, occurredAt: true, url: true,
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
      },
    }),
  ]);
  const byDay = new Map<string, Record<string, number>>();
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), {});
  }
  for (const e of events) {
    const key = e.occurredAt.toISOString().slice(0, 10);
    const rec = byDay.get(key);
    if (rec) rec[e.eventType] = (rec[e.eventType] ?? 0) + 1;
  }
  return {
    daily: [...byDay.entries()].map(([date, rec]) => ({ date, ...rec })),
    recent: recent.map((e) => ({ ...e, eventType: String(e.eventType) })),
  };
}
