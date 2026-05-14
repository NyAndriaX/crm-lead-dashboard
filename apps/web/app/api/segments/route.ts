import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createSegmentSchema } from "@/lib/schemas/campaign";
import { createSegment, listSegments } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("campaigns:read");
  const data = await listSegments();
  return json({ data });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("campaigns:write");
  const body = await parseBody(req, createSegmentSchema);
  const row = await createSegment(body);
  return created({ data: row, meta: { createdBy: s.sub } });
});
