/**
 * GET /api/rgpd/archived-leads — leads archivés (soft delete), réintégrables.
 */
import { handler, json, requirePermission } from "@/lib/api";
import { listArchivedLeads } from "@/lib/services/rgpd";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  await requirePermission("rgpd:manage");
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const result = await listArchivedLeads({ page, pageSize });
  return json(result);
});
