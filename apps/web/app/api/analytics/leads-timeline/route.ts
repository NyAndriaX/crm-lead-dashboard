import { z } from "zod";
import { handler, json, parseQuery, requirePermission } from "@/lib/api";
import { getLeadsTimeline } from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "ytd", "all"]).optional().default("90d"),
  granularity: z.enum(["day", "week", "month"]).optional().default("week"),
});

export const GET = handler(async (req) => {
  await requirePermission("analytics:read");
  const { period, granularity } = parseQuery(req, querySchema);
  const data = await getLeadsTimeline({ period, granularity });
  return json({ data });
});
