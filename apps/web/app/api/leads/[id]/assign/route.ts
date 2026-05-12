import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { assignLeadSchema } from "@/lib/schemas/lead";
import { assignLead } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/leads/:id/assign — assigne / désassigne un commercial (CRM-016).
export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:assign");
  const { id } = await params;
  const input = await parseBody(req, assignLeadSchema);
  const lead = await assignLead(id, input, s.sub);
  await audit({ userId: s.sub, action: "lead.assign", entityType: "lead", entityId: id, ip: clientIp(req), diff: input });
  return json(lead);
});
