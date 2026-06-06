import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { segmentFiltersSchema } from "@/lib/schemas/campaign";
import { countSegmentLeads, listSegmentLeads } from "@/lib/services/segments";
import { z } from "zod";

export const dynamic = "force-dynamic";

const previewSchema = z.object({
  filters: segmentFiltersSchema.default({}),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

/** POST /api/segments/preview — aperçu des leads ciblés sans enregistrer le segment. */
export const POST = handler(async (req) => {
  await requirePermission("campaigns:read");
  const input = await parseBody(req, previewSchema);
  const [result, total] = await Promise.all([
    listSegmentLeads(input.filters, { page: input.page, pageSize: input.pageSize }),
    countSegmentLeads(input.filters),
  ]);
  return json({ ...result, total });
});
