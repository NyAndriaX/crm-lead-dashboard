import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { updateSegmentSchema } from "@/lib/schemas/campaign";
import { toScope } from "@/lib/scope";
import { deleteSegment, getSegment, updateSegment, countSegmentLeads } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const { id } = await params;
  const row = await getSegment(id, scope);
  const count = await countSegmentLeads(row.filters);
  return json({ data: row, meta: { leadCount: count } });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const { id } = await params;
  const body = await parseBody(req, updateSegmentSchema);
  const row = await updateSegment(id, body, scope);
  return json({ data: row });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const { id } = await params;
  await deleteSegment(id, scope);
  return noContent();
});
