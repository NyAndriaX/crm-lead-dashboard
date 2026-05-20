import { handler, json, requirePermission } from "@/lib/api";
import { listAuditActions } from "@/lib/services/auditLogs";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("users:manage");
  const actions = await listAuditActions();
  return json({ data: actions });
});
