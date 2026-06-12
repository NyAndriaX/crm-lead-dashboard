import { handler, json, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { restoreLead } from "@/lib/services/leads";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/leads/:id/restore — restaure un lead soft-deleted.
export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:delete");
  const { id } = await params;
  const lead = await restoreLead(id, toScope(s));
  await audit({ userId: s.sub, action: "lead.restore", entityType: "lead", entityId: id, ip: clientIp(req) });
  return json(lead);
});
