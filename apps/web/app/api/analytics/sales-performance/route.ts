import { z } from "zod";
import { handler, json, parseQuery, requirePermission } from "@/lib/api";
import { getSalesPerformance } from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "ytd", "all"]).optional().default("30d"),
});

export const GET = handler(async (req) => {
  await requirePermission("analytics:read");
  const { period } = parseQuery(req, querySchema);
  const data = await getSalesPerformance(period);
  return json({ data });
});
