import { created, handler, json, parseBody, parseQuery, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createLeadSchema, listLeadsQuery } from "@/lib/schemas/lead";
import { createLead, listLeads } from "@/lib/services/leads";
import { emitWebhookEvent } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

// GET /api/leads — listing paginé (50/100/200) + tri + filtres + recherche.
export const GET = handler(async (req) => {
  await requirePermission("leads:read");
  const q = parseQuery(req, listLeadsQuery);
  return json(await listLeads(q));
});

// POST /api/leads — création manuelle d'un lead.
export const POST = handler(async (req) => {
  const s = await requirePermission("leads:write");
  const input = await parseBody(req, createLeadSchema);
  const lead = await createLead(input, s.sub);
  await audit({ userId: s.sub, action: "lead.create", entityType: "lead", entityId: lead.id, ip: clientIp(req) });
  // INT-01 : émet l'événement newLead vers les destinations webhook abonnées.
  void emitWebhookEvent("newLead", {
    leadId: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    email: lead.email,
    source: lead.source,
    status: lead.status,
    createdAt: lead.createdAt,
  });
  return created(lead);
});
