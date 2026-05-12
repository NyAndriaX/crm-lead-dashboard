/**
 * GET /api/admin/stats — KPIs du tableau de bord administrateur.
 * Réservé ADMIN + MANAGER.
 */
import { prisma } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";
import { ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    throw new ApiError(403, "Réservé aux administrateurs et managers", "forbidden");
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const STATUSES = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"] as const;

  const [totalLeads, activeLeads, newToday, newThisWeek, newThisMonth, totalUsers, activeUsers, recentImports,
    ...statusCounts
  ] = await prisma.$transaction([
    prisma.lead.count({ where: { deletedAt: null } }),
    prisma.lead.count({ where: { deletedAt: null, status: { notIn: ["CONVERTI", "PERDU"] } } }),
    prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: monthAgo } } }),
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { id: true, name: true } } } }),
    ...STATUSES.map((s) => prisma.lead.count({ where: { deletedAt: null, status: s } })),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, (statusCounts[i] as number) ?? 0]));

  return json({
    data: {
      leads: { total: totalLeads as number, active: activeLeads as number, newToday: newToday as number, newThisWeek: newThisWeek as number, newThisMonth: newThisMonth as number },
      byStatus,
      users: { total: totalUsers as number, active: activeUsers as number },
      recentImports,
    },
  });
});
