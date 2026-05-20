import { z } from "zod";
import { handler, json, parseQuery, requirePermission } from "@/lib/api";
import { listAuditLogs } from "@/lib/services/auditLogs";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const GET = handler(async (req) => {
  await requirePermission("users:manage");
  const filter = parseQuery(req, querySchema);
  const result = await listAuditLogs(filter);
  return json(result);
});
