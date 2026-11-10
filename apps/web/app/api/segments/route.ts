import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createSegmentSchema } from "@/lib/schemas/campaign";
import { createSegment, listSegments, listSegmentsWithCounts } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

// GET /api/segments[?counts=1] — avec counts=1 : taille d'audience et nombre de campagnes par segment.
export const GET = handler(async (req) => {
  await requirePermission("campaigns:read");
  const withCounts = new URL(req.url).searchParams.get("counts") === "1";
  const data = withCounts ? await listSegmentsWithCounts() : await listSegments();
  return json({ data });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("campaigns:write");
  const body = await parseBody(req, createSegmentSchema);
  const row = await createSegment(body);
  return created({ data: row, meta: { createdBy: s.sub } });
});
