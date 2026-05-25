/**
 * Service Audit Logs — lecture filtrable du journal d'activité (U-05).
 *
 * Le modèle AuditLog est alimenté par le helper `lib/audit.ts` à chaque action
 * sensible (login, lead.update, user.create, etc.). Ce service expose une
 * lecture paginée et filtrable réservée aux ADMIN.
 */
import { prisma, Prisma } from "@crm/db";

export type AuditLogFilter = {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  search?: string;
  /** ISO date string */
  from?: string;
  /** ISO date string */
  to?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogItem = {
  id: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  diff: unknown;
  createdAt: Date;
};

export async function listAuditLogs(filter: AuditLogFilter): Promise<{
  data: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 50));

  const where: Prisma.AuditLogWhereInput = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.action) where.action = { contains: filter.action };
  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.entityId) where.entityId = filter.entityId;
  if (filter.from || filter.to) {
    where.createdAt = {};
    if (filter.from) (where.createdAt as { gte?: Date }).gte = new Date(filter.from);
    if (filter.to) (where.createdAt as { lte?: Date }).lte = new Date(filter.to);
  }
  if (filter.search) {
    const search = filter.search.trim();
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { ip: { contains: search } },
        { entityId: { contains: search } },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Charge les utilisateurs en une seule requête pour éviter le N+1.
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x)))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.userId ? userById.get(r.userId) ?? null : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      ip: r.ip,
      diff: r.diff,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

/** Liste distincte des actions présentes en base (pour peupler le filtre de l'UI). */
export async function listAuditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 100,
  });
  return rows.map((r) => r.action);
}
