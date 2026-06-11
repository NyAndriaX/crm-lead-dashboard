import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createSegmentSchema } from "@/lib/schemas/campaign";
import { toScope } from "@/lib/scope";
import { createSegment, listSegments } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const data = await listSegments(scope);
  return json({ data });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const body = await parseBody(req, createSegmentSchema);
  const row = await createSegment(body, scope);
  return created({ data: row, meta: { createdBy: s.sub } });
});
