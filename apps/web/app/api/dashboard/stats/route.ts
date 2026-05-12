/**
 * GET /api/dashboard/stats — statistiques du tableau de bord principal.
 * Accessible à tous les rôles ; COMMERCIAL ne voit que ses propres leads.
 */
import { prisma } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  const isRestricted = session.role === "COMMERCIAL";
  const baseWhere = {
    deletedAt: null,
    ...(isRestricted ? { assignedToId: session.sub } : {}),
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prevMonthAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

  const STATUSES = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"] as const;

  // Génère les 7 derniers jours pour le graphe d'évolution
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const [
    total, thisMonth, prevMonth, newToday, thisWeek, avgScoreRaw,
    convertedCount, activeCount,
    recentLeads,
    ...statusCounts
  ] = await prisma.$transaction([
    prisma.lead.count({ where: baseWhere }),
    prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: monthAgo } } }),
    prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: prevMonthAgo, lt: monthAgo } } }),
    prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { ...baseWhere, createdAt: { gte: weekAgo } } }),
    prisma.lead.aggregate({ where: baseWhere, _avg: { score: true } }),
    prisma.lead.count({ where: { ...baseWhere, status: "CONVERTI" } }),
    prisma.lead.count({ where: { ...baseWhere, status: { notIn: ["CONVERTI", "PERDU"] } } }),
    prisma.lead.findMany({
      where: { ...baseWhere },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true, firstName: true, lastName: true, company: true,
        status: true, score: true, source: true, createdAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    ...STATUSES.map((s) => prisma.lead.count({ where: { ...baseWhere, status: s } })),
  ]);

  // Leads par jour (7 derniers jours) — requêtes en //
  const dailyCounts = await Promise.all(
    last7Days.map(async (day) => {
      const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      const count = await prisma.lead.count({
        where: { ...baseWhere, createdAt: { gte: day, lt: nextDay } },
      });
      return {
        date: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
        leads: count,
      };
    }),
  );

  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, (statusCounts[i] as number) ?? 0]));

  const conversionRate = (total as number) > 0
    ? Math.round(((convertedCount as number) / (total as number)) * 100)
    : 0;

  const monthTrend = (prevMonth as number) > 0
    ? Math.round((((thisMonth as number) - (prevMonth as number)) / (prevMonth as number)) * 100)
    : null;

  return json({
    data: {
      kpis: {
        total: total as number,
        activeLeads: activeCount as number,
        newToday: newToday as number,
        thisWeek: thisWeek as number,
        thisMonth: thisMonth as number,
        monthTrend,
        avgScore: Math.round((avgScoreRaw as { _avg: { score: number | null } })._avg?.score ?? 0),
        conversionRate,
        converted: convertedCount as number,
      },
      byStatus,
      dailyLeads: dailyCounts,
      recentLeads,
    },
  });
});
