import { prisma } from "./client";
import { estimateOpenAiCostUsd } from "./openaiPricing";

export type OpenAiUsageFeature =
  | "config_test"
  | "email_variants"
  | "email_generate"
  | "lead_brief"
  | "reply_categorize"
  | "email_personalize"
  | "sequence_personalize"
  | "auto_reply";

export async function recordOpenAiUsage(args: {
  userId: string;
  feature: OpenAiUsageFeature | string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): Promise<void> {
  const prompt = Math.max(0, args.promptTokens ?? 0);
  const completion = Math.max(0, args.completionTokens ?? 0);
  const total = Math.max(0, args.totalTokens ?? prompt + completion);
  if (total <= 0) return;

  const estimatedCostUsd = estimateOpenAiCostUsd({
    model: args.model,
    promptTokens: prompt,
    completionTokens: completion,
  });

  try {
    await prisma.openAiUsageLog.create({
      data: {
        userId: args.userId,
        feature: args.feature,
        model: args.model?.slice(0, 80) ?? null,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
        estimatedCostUsd,
      },
    });
  } catch (e) {
    console.warn("[openai-usage] enregistrement KO:", e instanceof Error ? e.message : e);
  }
}

export type OpenAiUsageSummary = {
  enabled: boolean;
  configured: boolean;
  model: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  totalCostUsd: number;
  monthTokens: number;
  monthRequestCount: number;
  monthCostUsd: number;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  last7Days: { date: string; tokens: number }[];
  byFeature: { feature: string; tokens: number; count: number; costUsd: number }[];
  byModel: { model: string; tokens: number; count: number; costUsd: number }[];
};

function periodBounds(year?: number, month?: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return {
    start,
    end,
    label: start.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
  };
}

async function buildUsageSummary(args: {
  whereUserId?: string;
  enabled: boolean;
  configured: boolean;
  model: string | null;
  year?: number;
  month?: number;
}): Promise<OpenAiUsageSummary> {
  const userFilter = args.whereUserId ? { userId: args.whereUserId } : {};
  const period = periodBounds(args.year, args.month);
  const monthStart = period.start;
  const monthEnd = period.end;

  const [allTime, monthAgg, byFeatureRaw, byModelRaw, logs7d] = await Promise.all([
    prisma.openAiUsageLog.aggregate({
      where: userFilter,
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCostUsd: true },
      _count: { id: true },
    }),
    prisma.openAiUsageLog.aggregate({
      where: { ...userFilter, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalTokens: true, estimatedCostUsd: true },
      _count: { id: true },
    }),
    prisma.openAiUsageLog.groupBy({
      by: ["feature"],
      where: { ...userFilter, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalTokens: true, estimatedCostUsd: true },
      _count: { id: true },
      orderBy: { _sum: { totalTokens: "desc" } },
    }),
    prisma.openAiUsageLog.groupBy({
      by: ["model"],
      where: { ...userFilter, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalTokens: true, estimatedCostUsd: true },
      _count: { id: true },
      orderBy: { _sum: { totalTokens: "desc" } },
    }),
    prisma.openAiUsageLog.findMany({
      where: {
        ...userFilter,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { totalTokens: true, createdAt: true },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const tokens = logs7d
      .filter((l) => l.createdAt >= d && l.createdAt < next)
      .reduce((s, l) => s + l.totalTokens, 0);
    return {
      date: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      tokens,
    };
  });

  const totalCostUsd = allTime._sum.estimatedCostUsd ?? 0;
  const monthCostUsd = monthAgg._sum.estimatedCostUsd ?? 0;

  return {
    enabled: args.enabled,
    configured: args.configured,
    model: args.model,
    totalTokens: allTime._sum.totalTokens ?? 0,
    promptTokens: allTime._sum.promptTokens ?? 0,
    completionTokens: allTime._sum.completionTokens ?? 0,
    requestCount: allTime._count.id,
    totalCostUsd,
    monthTokens: monthAgg._sum.totalTokens ?? 0,
    monthRequestCount: monthAgg._count.id,
    monthCostUsd,
    periodYear: monthStart.getFullYear(),
    periodMonth: monthStart.getMonth() + 1,
    periodLabel: period.label,
    last7Days,
    byFeature: byFeatureRaw.map((r) => ({
      feature: r.feature,
      tokens: r._sum.totalTokens ?? 0,
      count: r._count.id,
      costUsd: r._sum.estimatedCostUsd ?? 0,
    })),
    byModel: byModelRaw
      .filter((r) => r.model)
      .map((r) => ({
        model: r.model!,
        tokens: r._sum.totalTokens ?? 0,
        count: r._count.id,
        costUsd: r._sum.estimatedCostUsd ?? 0,
      })),
  };
}

export type OpenAiUsagePeriod = { year?: number; month?: number };

function emptyUsageSummary(args: {
  enabled: boolean;
  configured: boolean;
  model: string | null;
  year?: number;
  month?: number;
}): OpenAiUsageSummary {
  const period = periodBounds(args.year, args.month);
  return {
    enabled: args.enabled,
    configured: args.configured,
    model: args.model,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    requestCount: 0,
    totalCostUsd: 0,
    monthTokens: 0,
    monthRequestCount: 0,
    monthCostUsd: 0,
    periodYear: period.start.getFullYear(),
    periodMonth: period.start.getMonth() + 1,
    periodLabel: period.label,
    last7Days: [],
    byFeature: [],
    byModel: [],
  };
}

export async function getOpenAiUsageSummary(
  userId: string,
  period?: OpenAiUsagePeriod,
): Promise<OpenAiUsageSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiEnabled: true, openAiApiKeyEnc: true, openAiModel: true },
  });
  const logCount = await prisma.openAiUsageLog.count({ where: { userId } });
  if (!user?.openAiApiKeyEnc && logCount === 0) {
    return emptyUsageSummary({
      enabled: user?.openAiEnabled ?? false,
      configured: false,
      model: user?.openAiModel ?? null,
      year: period?.year,
      month: period?.month,
    });
  }

  return buildUsageSummary({
    whereUserId: userId,
    enabled: user?.openAiEnabled ?? false,
    configured: Boolean(user?.openAiApiKeyEnc) || logCount > 0,
    model: user?.openAiModel ?? null,
    year: period?.year,
    month: period?.month,
  });
}

/** Vue agrégée pour administrateurs (tous les utilisateurs). */
export async function getOpenAiUsageSummaryOrg(period?: OpenAiUsagePeriod): Promise<OpenAiUsageSummary> {
  const [configuredCount, logCount, anyUser] = await Promise.all([
    prisma.user.count({ where: { openAiApiKeyEnc: { not: null } } }),
    prisma.openAiUsageLog.count(),
    prisma.user.findFirst({
      where: { openAiApiKeyEnc: { not: null } },
      select: { openAiModel: true, openAiEnabled: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return buildUsageSummary({
    enabled: anyUser?.openAiEnabled ?? configuredCount > 0,
    configured: configuredCount > 0 || logCount > 0,
    model: anyUser?.openAiModel ?? null,
    year: period?.year,
    month: period?.month,
  });
}

/** Dashboard : consommation OpenAI strictement personnelle (isolation par utilisateur). */
export async function getOpenAiUsageSummaryForDashboard(
  userId: string,
  _role: string,
  period?: OpenAiUsagePeriod,
): Promise<OpenAiUsageSummary | null> {
  return getOpenAiUsageSummary(userId, period);
}
