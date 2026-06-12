import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { changeStatusSchema } from "@/lib/schemas/lead";
import { toScope } from "@/lib/scope";
import { changeStatus } from "@/lib/services/leads";
import { emitWebhookEvent } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/leads/:id/status — change le statut (transitions validées — CRM-014).
export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:write");
  const scope = toScope(s);
  const { id } = await params;
  const input = await parseBody(req, changeStatusSchema);
  const lead = await changeStatus(id, input, scope);
  await audit({ userId: s.sub, action: "lead.status_change", entityType: "lead", entityId: id, ip: clientIp(req), diff: input });
  // INT-01 : webhook leadStatusChanged
  void emitWebhookEvent("leadStatusChanged", { leadId: id, status: input.status }, scope.userId);
  return json(lead);
});
