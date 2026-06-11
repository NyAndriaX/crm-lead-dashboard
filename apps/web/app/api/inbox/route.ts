import { z } from "zod";
import { handler, json, parseQuery, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { listInbox } from "@/lib/services/inbox";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  leadId: z.string().trim().min(1).optional(),
  unreadOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = handler(async (req) => {
  const s = await requirePermission("inbox:read");
  const scope = toScope(s);
  const q = parseQuery(req, querySchema);
  const result = await listInbox(scope, {
    search: q.search,
    leadId: q.leadId,
    unreadOnly: q.unreadOnly === "true",
    page: q.page,
    pageSize: q.pageSize,
  });
  return json(result);
});
