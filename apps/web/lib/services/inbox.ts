/**
 * Service Inbox — lecture des messages entrants/sortants (R-01, R-03, R-07).
 *
 * Les champs `fromEnc` / `toEnc` sont stockés chiffrés AES-256-GCM. Ce service
 * déchiffre uniquement côté serveur, et n'expose JAMAIS le payload encrypté brut.
 */
import { prisma, Prisma, strictOwnerWhere, type DataScope } from "@crm/db";
import { ApiError } from "@/lib/api";
import { decryptOrNull } from "@/lib/crypto";

export type InboxFilter = {
  search?: string;
  leadId?: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type InboxItem = {
  id: string;
  leadId: string | null;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    status: string;
  } | null;
  messageId: string;
  inReplyTo: string | null;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string | null;
  preview: string | null;
  category: string | null;
  isAutoReply: boolean;
  isRead: boolean;
  receivedAt: Date;
};

export type InboxThreadItem = InboxItem & {
  bodyText: string | null;
  bodyHtml: string | null;
};

function makePreview(item: { bodyText: string | null; bodyHtml: string | null }, maxLen = 160): string | null {
  if (item.bodyText) {
    const trimmed = item.bodyText.replace(/\s+/g, " ").trim();
    return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed || null;
  }
  if (item.bodyHtml) {
    const text = item.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text || null;
  }
  return null;
}

function mapItem(row: {
  id: string;
  leadId: string | null;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    status: string;
  } | null;
  messageId: string;
  inReplyTo: string | null;
  direction: string;
  fromEnc: Uint8Array;
  toEnc: Uint8Array;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  category: string | null;
  isAutoReply: boolean;
  isRead: boolean;
  receivedAt: Date;
}): InboxItem {
  return {
    id: row.id,
    leadId: row.leadId,
    lead: row.lead,
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    from: decryptOrNull(row.fromEnc) ?? "",
    to: decryptOrNull(row.toEnc) ?? "",
    subject: row.subject,
    preview: makePreview({ bodyText: row.bodyText, bodyHtml: row.bodyHtml }),
    category: row.category,
    isAutoReply: row.isAutoReply,
    isRead: row.isRead,
    receivedAt: row.receivedAt,
  };
}

export async function listInbox(scope: DataScope, filter: InboxFilter): Promise<{
  data: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));

  const where: Prisma.InboxMessageWhereInput = {
    ...strictOwnerWhere(scope.userId),
    direction: "inbound",
    isAutoReply: false,
    deletedAt: null,
    leadId: filter.leadId ? filter.leadId : { not: null },
  };

  if (filter.unreadOnly) where.isRead = false;
  if (filter.search) {
    const search = filter.search.trim();
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { bodyText: { contains: search } },
        { bodyHtml: { contains: search } },
        { messageId: { contains: search } },
        { category: { contains: search } },
        { lead: { firstName: { contains: search } } },
        { lead: { lastName: { contains: search } } },
        { lead: { company: { contains: search } } },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.inboxMessage.findMany({
      where,
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, company: true, status: true },
        },
      },
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inboxMessage.count({ where }),
  ]);

  return {
    data: rows.map(mapItem),
    total,
    page,
    pageSize,
  };
}

export async function getInboxMessage(id: string, scope: DataScope): Promise<InboxThreadItem | null> {
  const row = await prisma.inboxMessage.findFirst({
    where: { id, ...strictOwnerWhere(scope.userId) },
    include: {
      lead: {
        select: { id: true, firstName: true, lastName: true, company: true, status: true },
      },
    },
  });
  if (!row || !row.leadId || row.isAutoReply || row.deletedAt) return null;
  return {
    ...mapItem(row),
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
  };
}

export async function getLeadThread(leadId: string, scope: DataScope): Promise<InboxThreadItem[]> {
  const rows = await prisma.inboxMessage.findMany({
    where: { leadId, deletedAt: null, ...strictOwnerWhere(scope.userId) },
    include: {
      lead: {
        select: { id: true, firstName: true, lastName: true, company: true, status: true },
      },
    },
    orderBy: { receivedAt: "asc" },
  });
  return rows.map((r) => ({
    ...mapItem(r),
    bodyText: r.bodyText,
    bodyHtml: r.bodyHtml,
  }));
}

export async function markInboxRead(id: string, isRead: boolean, scope: DataScope): Promise<void> {
  const row = await getInboxMessage(id, scope);
  if (!row) throw new ApiError(404, "Message introuvable", "not_found");
  await prisma.inboxMessage.update({ where: { id }, data: { isRead } });
}

export async function assignInboxToLead(id: string, leadId: string | null, scope: DataScope): Promise<void> {
  const row = await getInboxMessage(id, scope);
  if (!row) throw new ApiError(404, "Message introuvable", "not_found");
  await prisma.inboxMessage.update({ where: { id }, data: { leadId } });
}

export async function countUnreadInbox(scope: DataScope): Promise<number> {
  return prisma.inboxMessage.count({
    where: {
      ...strictOwnerWhere(scope.userId),
      direction: "inbound",
      isRead: false,
      leadId: { not: null },
      isAutoReply: false,
      deletedAt: null,
    },
  });
}

export async function deleteInboxMessage(id: string, scope: DataScope): Promise<void> {
  const row = await prisma.inboxMessage.findFirst({
    where: { id, ...strictOwnerWhere(scope.userId) },
    select: { id: true, leadId: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw new ApiError(404, "Message introuvable", "not_found");
  if (!row.leadId) {
    throw new ApiError(400, "Seuls les messages rattachés à un lead peuvent être supprimés.", "no_lead");
  }
  await prisma.inboxMessage.update({ where: { id }, data: { deletedAt: new Date() } });
}
