import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { updateLeadSchema } from "@/lib/schemas/lead";
import { toScope } from "@/lib/scope";
import { getLead, softDeleteLead, updateLead } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id — fiche lead (PII déchiffrée).
export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("leads:read");
  const scope = toScope(s);
  const { id } = await params;
  return json(await getLead(id, scope));
});

// PUT /api/leads/:id — édition.
export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:write");
  const scope = toScope(s);
  const { id } = await params;
  const input = await parseBody(req, updateLeadSchema);
  const lead = await updateLead(id, input, scope);
  await audit({ userId: s.sub, action: "lead.update", entityType: "lead", entityId: id, ip: clientIp(req), diff: input });
  return json(lead);
});

// DELETE /api/leads/:id — soft delete (restaurable via POST /api/leads/:id/restore).
export const DELETE = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:delete");
  const scope = toScope(s);
  const { id } = await params;
  await softDeleteLead(id, scope);
  await audit({ userId: s.sub, action: "lead.soft_delete", entityType: "lead", entityId: id, ip: clientIp(req) });
  return noContent();
});
