import { created, handler, json, parseBody, parseQuery, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createLeadSchema, listLeadsQuery } from "@/lib/schemas/lead";
import { toScope } from "@/lib/scope";
import { createLead, listLeads } from "@/lib/services/leads";
import { emitWebhookEvent } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

// GET /api/leads — listing paginé (50/100/200) + tri + filtres + recherche.
export const GET = handler(async (req) => {
  const s = await requirePermission("leads:read");
  const scope = toScope(s);
  const q = parseQuery(req, listLeadsQuery);
  return json(await listLeads(q, scope));
});

// POST /api/leads — création manuelle d'un lead.
export const POST = handler(async (req) => {
  const s = await requirePermission("leads:write");
  const scope = toScope(s);
  const input = await parseBody(req, createLeadSchema);
  const lead = await createLead(input, scope);
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
