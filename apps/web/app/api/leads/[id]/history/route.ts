import { handler, json, requirePermission } from "@/lib/api";
import { getLeadDetail } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id/history — historique chronologique du lead (Timeline — CRM-011).
export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("leads:read");
  const { id } = await params;
  const { history } = await getLeadDetail(id);
  return json({ data: history });
});
