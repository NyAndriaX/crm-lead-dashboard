import { prisma } from "./client";

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

  try {
    await prisma.openAiUsageLog.create({
      data: {
        userId: args.userId,
        feature: args.feature,
        model: args.model?.slice(0, 80) ?? null,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
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
  monthTokens: number;
  monthRequestCount: number;
  last7Days: { date: string; tokens: number }[];
  byFeature: { feature: string; tokens: number; count: number }[];
};

export async function getOpenAiUsageSummary(userId: string): Promise<OpenAiUsageSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiEnabled: true, openAiApiKeyEnc: true, openAiModel: true },
  });
  if (!user?.openAiApiKeyEnc) {
    return {
      enabled: user?.openAiEnabled ?? false,
      configured: false,
      model: user?.openAiModel ?? null,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      requestCount: 0,
      monthTokens: 0,
      monthRequestCount: 0,
      last7Days: [],
      byFeature: [],
    };
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [allTime, monthAgg, byFeatureRaw, logs7d] = await Promise.all([
    prisma.openAiUsageLog.aggregate({
      where: { userId },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { id: true },
    }),
    prisma.openAiUsageLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { totalTokens: true },
      _count: { id: true },
    }),
    prisma.openAiUsageLog.groupBy({
      by: ["feature"],
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { totalTokens: true },
      _count: { id: true },
      orderBy: { _sum: { totalTokens: "desc" } },
    }),
    prisma.openAiUsageLog.findMany({
      where: {
        userId,
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

  return {
    enabled: user.openAiEnabled,
    configured: true,
    model: user.openAiModel,
    totalTokens: allTime._sum.totalTokens ?? 0,
    promptTokens: allTime._sum.promptTokens ?? 0,
    completionTokens: allTime._sum.completionTokens ?? 0,
    requestCount: allTime._count.id,
    monthTokens: monthAgg._sum.totalTokens ?? 0,
    monthRequestCount: monthAgg._count.id,
    last7Days,
    byFeature: byFeatureRaw.map((r) => ({
      feature: r.feature,
      tokens: r._sum.totalTokens ?? 0,
      count: r._count.id,
    })),
  };
}
