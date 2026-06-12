/**
 * GET /api/admin/stats — KPIs du tableau de bord administrateur.
 * Réservé ADMIN + MANAGER.
 */
import { prisma, buildLeadVisibilityWhere } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { NOT_DELETED } from "@/lib/notDeleted";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  if (!["ADMIN", "MANAGER"].includes(session.role)) {
    throw new ApiError(403, "Réservé aux administrateurs et managers", "forbidden");
  }

  const scope = toScope(session);
  const leadWhere = { AND: [NOT_DELETED, buildLeadVisibilityWhere(scope)] };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const STATUSES = ["NOUVEAU", "CONTACTE", "QUALIFIE", "EN_DISCUSSION", "CONVERTI", "PERDU"] as const;

  const isAdmin = session.role === "ADMIN";
  const importWhere = isAdmin ? {} : { userId: scope.userId };

  const [totalLeads, activeLeads, newToday, newThisWeek, newThisMonth, recentImports, ...statusCounts] =
    await prisma.$transaction([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { AND: [...leadWhere.AND, { status: { notIn: ["CONVERTI", "PERDU"] } }] } }),
      prisma.lead.count({ where: { AND: [...leadWhere.AND, { createdAt: { gte: today } }] } }),
      prisma.lead.count({ where: { AND: [...leadWhere.AND, { createdAt: { gte: weekAgo } }] } }),
      prisma.lead.count({ where: { AND: [...leadWhere.AND, { createdAt: { gte: monthAgo } }] } }),
      prisma.importJob.findMany({
        where: importWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      ...STATUSES.map((s) => prisma.lead.count({ where: { AND: [...leadWhere.AND, { status: s }] } })),
    ]);

  const users = isAdmin
    ? {
        total: await prisma.user.count(),
        active: await prisma.user.count({ where: { isActive: true } }),
      }
    : null;

  const importsRaw = recentImports as { userId: string }[];
  const importUserIds = [...new Set(importsRaw.map((j) => j.userId))];
  const importUsers = importUserIds.length
    ? await prisma.user.findMany({ where: { id: { in: importUserIds } }, select: { id: true, name: true } })
    : [];
  const importUserById = new Map(importUsers.map((u) => [u.id, u]));
  const recentImportsWithUser = importsRaw.map((j) => ({
    ...j,
    user: importUserById.get(j.userId) ?? null,
  }));

  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, (statusCounts[i] as number) ?? 0]));

  return json({
    data: {
      leads: { total: totalLeads as number, active: activeLeads as number, newToday: newToday as number, newThisWeek: newThisWeek as number, newThisMonth: newThisMonth as number },
      byStatus,
      users,
      recentImports: recentImportsWithUser,
    },
  });
});
