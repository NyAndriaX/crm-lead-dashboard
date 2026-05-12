import { handler, json, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { recalcScore } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/leads/:id/recalculate-score — recalcule le lead scoring (CRM-019).
export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:write");
  const { id } = await params;
  const score = await recalcScore(id);
  await audit({ userId: s.sub, action: "lead.recalc_score", entityType: "lead", entityId: id, ip: clientIp(req) });
  return json({ id, score });
});
