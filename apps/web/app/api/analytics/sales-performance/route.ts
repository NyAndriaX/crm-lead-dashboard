import { z } from "zod";
import { handler, json, parseQuery, requirePermission } from "@/lib/api";
import { getSalesPerformance } from "@/lib/services/analytics";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "ytd", "all"]).optional().default("30d"),
});

export const GET = handler(async (req) => {
  const session = await requirePermission("analytics:read");
  const { period } = parseQuery(req, querySchema);
  const data = await getSalesPerformance(toScope(session), period);
  return json({ data });
});
