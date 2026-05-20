import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { setTagsSchema } from "@/lib/schemas/lead";
import { setLeadTags } from "@/lib/services/leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/leads/:id/tags — remplace l'ensemble des tags d'un lead (CRM-015).
export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:write");
  const { id } = await params;
  const input = await parseBody(req, setTagsSchema);
  const lead = await setLeadTags(id, input, s.sub);
  await audit({ userId: s.sub, action: "lead.tags_set", entityType: "lead", entityId: id, ip: clientIp(req), diff: input });
  return json(lead);
});
