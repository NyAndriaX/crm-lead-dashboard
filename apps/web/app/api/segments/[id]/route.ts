import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { updateSegmentSchema } from "@/lib/schemas/campaign";
import { deleteSegment, getSegment, updateSegment, countSegmentLeads } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:read");
  const { id } = await params;
  const row = await getSegment(id);
  const count = await countSegmentLeads(row.filters);
  return json({ data: row, meta: { leadCount: count } });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  await requirePermission("campaigns:write");
  const { id } = await params;
  const body = await parseBody(req, updateSegmentSchema);
  const row = await updateSegment(id, body);
  return json({ data: row });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:write");
  const { id } = await params;
  await deleteSegment(id);
  return noContent();
});
