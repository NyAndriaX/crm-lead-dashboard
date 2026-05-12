// Journalisation — CRM-020 / SEC-05. Écrit dans `auditLogs` (qui/quoi/quand/IP).
// TTL 12 mois géré côté Mongo (voir packages/db/prisma/manual-indexes.md).
import { prisma } from "@crm/db";

export async function audit(params: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  diff?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ip: params.ip ?? undefined,
        diff: params.diff === undefined ? undefined : (params.diff as object),
      },
    });
  } catch (e) {
    // L'audit ne doit jamais faire échouer une mutation métier — on log et on continue.
    console.error("[audit] échec écriture auditLog:", e);
  }
}

export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}
