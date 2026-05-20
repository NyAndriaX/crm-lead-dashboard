import { z } from "zod";
import { handler, json, parseQuery, requireSession } from "@/lib/api";
import { listNotificationsForUser } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const GET = handler(async (req) => {
  const s = await requireSession();
  const { unreadOnly, page, pageSize } = parseQuery(req, querySchema);
  const result = await listNotificationsForUser(s.sub, {
    unreadOnly: unreadOnly === "true",
    page,
    pageSize,
  });
  return json(result);
});
