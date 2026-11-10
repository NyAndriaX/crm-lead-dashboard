import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { segmentFiltersSchema } from "@/lib/schemas/campaign";
import { previewSegment } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

// POST /api/segments/preview — taille et échantillon d'une audience avant enregistrement.
export const POST = handler(async (req) => {
  await requirePermission("campaigns:read");
  const body = await parseBody(req, z.object({ filters: segmentFiltersSchema.default({}) }));
  return json({ data: await previewSegment(body.filters) });
});
