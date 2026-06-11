import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { getSegment, listSegmentLeads } from "@/lib/services/segments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/segments/:id/leads — aperçu des leads ciblés par le segment. */
export const GET = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const { id } = await params;
  const row = await getSegment(id, scope);
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const result = await listSegmentLeads(row.filters, { page, pageSize });
  return json(result);
});
