/**
 * Service Analytics — agrégations pour le module Analytique & Reporting
 * (AN-01 KPI global, AN-02 campagnes, AN-03 timeline leads, AN-04 perf
 * commerciale, AN-05 export).
 *
 * Toutes les fonctions retournent des objets sérialisables JSON (Date → ISO).
 */
import {
  prisma,
  buildLeadVisibilityWhere,
  strictCreatorWhere,
  strictOwnerWhere,
  isAdminRole,
  Role,
  type DataScope,
  type Prisma,
} from "@crm/db";

function scopedLeadWhere(scope: DataScope, extra: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput {
  return { AND: [{ deletedAt: null }, buildLeadVisibilityWhere(scope), extra] };
}

function scopedEventWhere(scope: DataScope, extra: Prisma.EmailEventWhereInput = {}): Prisma.EmailEventWhereInput {
  return {
    AND: [
      {
        OR: [
          { campaign: { createdById: scope.userId } },
          { lead: buildLeadVisibilityWhere(scope) },
        ],
      },
      extra,
    ],
  };
}

// ── Période ──────────────────────────────────────────────────────────────────

export type Period = "7d" | "30d" | "90d" | "ytd" | "all";

export function periodToDateRange(period: Period): { from: Date | null; to: Date } {
  const to = new Date();
  if (period === "all") return { from: null, to };
  if (period === "ytd") {
    const from = new Date(to.getFullYear(), 0, 1);
    return { from, to };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to };
}

// ── AN-01 — KPIs globaux ─────────────────────────────────────────────────────

export type GlobalKpis = {
  period: Period;
  leadsTotal: number;
  leadsActive: number;
  leadsCreated: number;
  emailsSent: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  conversionRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
  inboxMessagesReceived: number;
  campaignsActive: number;
};

export async function getGlobalKpis(scope: DataScope, period: Period): Promise<GlobalKpis> {
  const { from, to } = periodToDateRange(period);
  const dateFilter: Prisma.DateTimeFilter | undefined = from ? { gte: from, lte: to } : undefined;
  const occurredFilter = dateFilter ? { occurredAt: dateFilter } : {};
  const createdFilter = dateFilter ? { createdAt: dateFilter } : {};

  const [
    leadsTotal,
    leadsActive,
    leadsCreated,
    eventGroups,
    inboxMessagesReceived,
    converted,
    campaignsActive,
  ] = await Promise.all([
    prisma.lead.count({ where: scopedLeadWhere(scope) }),
    prisma.lead.count({
      where: scopedLeadWhere(scope, {
        emailStatus: { notIn: ["HARD_BOUNCE", "UNSUBSCRIBED"] },
        status: { notIn: ["PERDU"] },
      }),
    }),
    prisma.lead.count({
      where: scopedLeadWhere(scope, createdFilter),
    }),
    prisma.emailEvent.groupBy({
      by: ["eventType"],
      where: scopedEventWhere(scope, occurredFilter),
      _count: { _all: true },
    }),
    prisma.inboxMessage.count({
      where: {
        direction: "inbound",
        ...strictOwnerWhere(scope.userId),
        ...(dateFilter ? { receivedAt: dateFilter } : {}),
      },
    }),
    prisma.lead.count({
      where: scopedLeadWhere(scope, {
        status: "CONVERTI",
        ...(dateFilter ? { updatedAt: dateFilter } : {}),
      }),
    }),
    prisma.campaign.count({
      where: { status: { in: ["SENDING", "SCHEDULED"] }, ...strictCreatorWhere(scope.userId) },
    }),
  ]);

  const n = (t: string) => eventGroups.find((g) => String(g.eventType) === t)?._count._all ?? 0;
  const sent = n("SENT");
  const opens = n("OPEN");
  const clicks = n("CLICK");
  const bounces = n("BOUNCE");
  const unsubs = n("UNSUBSCRIBE");
  const replies = n("REPLIED");

  const rate = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return {
    period,
    leadsTotal,
    leadsActive,
    leadsCreated,
    emailsSent: sent,
    openRate: rate(opens, sent),
    clickRate: rate(clicks, sent),
    replyRate: rate(replies, sent),
    bounceRate: rate(bounces, sent),
    unsubscribeRate: rate(unsubs, sent),
    conversionRate: rate(converted, leadsCreated || leadsTotal),
    inboxMessagesReceived,
    campaignsActive,
  };
}

// ── AN-02 — Rapport campagnes ────────────────────────────────────────────────

export type CampaignReportRow = {
  id: string;
  name: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubs: number;
  replies: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  ctorRate: number | null; // CTOR : clics / ouvertures
};

export async function listCampaignReports(scope: DataScope): Promise<CampaignReportRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: strictCreatorWhere(scope.userId),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, scheduledAt: true, createdAt: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  if (campaignIds.length === 0) return [];

  // Agrège tous les events en une seule requête groupBy (perf).
  const groups = await prisma.emailEvent.groupBy({
    by: ["campaignId", "eventType"],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  });
  const byCampaign = new Map<string, Record<string, number>>();
  for (const g of groups) {
    if (!g.campaignId) continue;
    if (!byCampaign.has(g.campaignId)) byCampaign.set(g.campaignId, {});
    byCampaign.get(g.campaignId)![String(g.eventType)] = g._count._all;
  }

  const rate = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return campaigns.map((c) => {
    const ev = byCampaign.get(c.id) ?? {};
    const sent = ev.SENT ?? 0;
    const delivered = sent - (ev.BOUNCE ?? 0);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      scheduledAt: c.scheduledAt,
      createdAt: c.createdAt,
      sent,
      delivered: Math.max(0, delivered),
      opens: ev.OPEN ?? 0,
      clicks: ev.CLICK ?? 0,
      bounces: ev.BOUNCE ?? 0,
      unsubs: ev.UNSUBSCRIBE ?? 0,
      replies: ev.REPLIED ?? 0,
      openRate: rate(ev.OPEN ?? 0, sent),
      clickRate: rate(ev.CLICK ?? 0, sent),
      replyRate: rate(ev.REPLIED ?? 0, sent),
      ctorRate: rate(ev.CLICK ?? 0, ev.OPEN ?? 0),
    };
  });
}

// ── AN-03 — Évolution temporelle des leads ───────────────────────────────────

export type Granularity = "day" | "week" | "month";

export type TimelineBucket = {
  period: string; // YYYY-MM-DD ou YYYY-Www ou YYYY-MM
  total: number;
  bySource: Record<string, number>;
};

function bucketKey(date: Date, gran: Granularity): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (gran === "month") return `${y}-${m}`;
  if (gran === "week") {
    // ISO week number (lightweight)
    const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `${y}-${m}-${d}`;
}

export async function getLeadsTimeline(
  scope: DataScope,
  args: {
    period: Period;
    granularity: Granularity;
  },
): Promise<{ buckets: TimelineBucket[]; sources: string[] }> {
  const { from, to } = periodToDateRange(args.period);
  const where: Prisma.LeadWhereInput = scopedLeadWhere(
    scope,
    from ? { createdAt: { gte: from, lte: to } } : {},
  );
  const leads = await prisma.lead.findMany({
    where,
    select: { createdAt: true, source: true },
    take: 50_000,
  });
  const bucketMap = new Map<string, TimelineBucket>();
  const sourceSet = new Set<string>();
  for (const l of leads) {
    const key = bucketKey(l.createdAt, args.granularity);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { period: key, total: 0, bySource: {} });
    }
    const bucket = bucketMap.get(key)!;
    bucket.total += 1;
    const src = l.source ?? "(sans source)";
    sourceSet.add(src);
    bucket.bySource[src] = (bucket.bySource[src] ?? 0) + 1;
  }
  const buckets = Array.from(bucketMap.values()).sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  return { buckets, sources: Array.from(sourceSet).sort() };
}

// ── AN-04 — Performance commerciale ──────────────────────────────────────────

export type SalesPerfRow = {
  userId: string;
  userName: string;
  userEmail: string;
  teamId: string | null;
  leadsAssigned: number;
  leadsContacted: number;
  leadsQualified: number;
  leadsConverted: number;
  leadsLost: number;
  conversionRate: number | null;
  avgScore: number | null;
  repliesReceived: number;
};

export async function getSalesPerformance(scope: DataScope, period: Period): Promise<SalesPerfRow[]> {
  const { from, to } = periodToDateRange(period);
  const leadFilter: Prisma.LeadWhereInput = scopedLeadWhere(
    scope,
    from ? { updatedAt: { gte: from, lte: to } } : {},
  );

  const users = await prisma.user.findMany({
    where: isAdminRole(scope.role)
      ? { isActive: true, OR: [{ id: scope.userId }, { role: { not: Role.ADMIN } }] }
      : { id: scope.userId, isActive: true },
    select: { id: true, name: true, email: true, teamId: true },
    orderBy: { name: "asc" },
  });
  if (users.length === 0) return [];

  // Pour chaque user, on groupe les leads par statut.
  const groups = await prisma.lead.groupBy({
    by: ["assignedToId", "status"],
    where: { ...leadFilter, assignedToId: { in: users.map((u) => u.id) } },
    _count: { _all: true },
  });
  const scoreAggs = await prisma.lead.groupBy({
    by: ["assignedToId"],
    where: { ...leadFilter, assignedToId: { in: users.map((u) => u.id) } },
    _avg: { score: true },
  });
  const replyEvents = await prisma.emailEvent.groupBy({
    by: ["leadId"],
    where: scopedEventWhere(scope, {
      eventType: "REPLIED",
      ...(from ? { occurredAt: { gte: from, lte: to } } : {}),
    }),
    _count: { _all: true },
  });
  // Recharge les leads pour mapper leadId → assignedToId (1 requête)
  const leadIds = replyEvents.map((r) => r.leadId).filter((x): x is string => Boolean(x));
  const leadAssign = leadIds.length > 0
    ? await prisma.lead.findMany({
        where: { id: { in: leadIds }, ...buildLeadVisibilityWhere(scope) },
        select: { id: true, assignedToId: true },
      })
    : [];
  const assignByLead = new Map(leadAssign.map((l) => [l.id, l.assignedToId]));
  const repliesByUser = new Map<string, number>();
  for (const r of replyEvents) {
    if (!r.leadId) continue;
    const userId = assignByLead.get(r.leadId);
    if (!userId) continue;
    repliesByUser.set(userId, (repliesByUser.get(userId) ?? 0) + r._count._all);
  }

  return users.map((u): SalesPerfRow => {
    const userGroups = groups.filter((g) => g.assignedToId === u.id);
    const byStatus = (s: string) =>
      userGroups.find((g) => String(g.status) === s)?._count._all ?? 0;
    const assigned = userGroups.reduce((a, b) => a + b._count._all, 0);
    const contacted = byStatus("CONTACTE");
    const qualified = byStatus("QUALIFIE");
    const converted = byStatus("CONVERTI");
    const lost = byStatus("PERDU");
    const conversionRate = assigned > 0 ? Math.round((converted / assigned) * 1000) / 10 : null;
    const scoreRow = scoreAggs.find((s) => s.assignedToId === u.id);
    const avgScore = scoreRow?._avg.score != null ? Math.round(scoreRow._avg.score * 10) / 10 : null;
    return {
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      teamId: u.teamId,
      leadsAssigned: assigned,
      leadsContacted: contacted,
      leadsQualified: qualified,
      leadsConverted: converted,
      leadsLost: lost,
      conversionRate,
      avgScore,
      repliesReceived: repliesByUser.get(u.id) ?? 0,
    };
  });
}
