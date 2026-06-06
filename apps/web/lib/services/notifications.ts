/**
 * Service Notifications — lecture/écriture des notifications utilisateur (R-05).
 *
 * Les notifications sont créées par les workers (ex. imap-sync à la réception
 * d'une réponse) ou par l'API web (ex. lead.assign). Chaque notification déclenche
 * aussi un email de renfort via notifyUser() (@crm/db).
 */
import { prisma } from "@crm/db";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
};

export async function listNotificationsForUser(
  userId: string,
  opts: { unreadOnly?: boolean; page?: number; pageSize?: number } = {},
): Promise<{ data: NotificationItem[]; total: number; unread: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const baseWhere = { userId };
  const where = opts.unreadOnly ? { ...baseWhere, isRead: false } : baseWhere;

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      isRead: r.isRead,
      createdAt: r.createdAt,
    })),
    total,
    unread,
  };
}

export async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllRead(userId: string): Promise<{ count: number }> {
  const r = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { count: r.count };
}

export async function countUnreadForUser(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}
