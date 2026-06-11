import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { getLeadDetail } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id/history — historique chronologique du lead (Timeline — CRM-011).
export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("leads:read");
  const scope = toScope(s);
  const { id } = await params;
  const { history } = await getLeadDetail(id, scope);
  return json({ data: history });
});
