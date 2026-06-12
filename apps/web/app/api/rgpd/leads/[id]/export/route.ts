/**
 * GET /api/rgpd/leads/:id/export — portabilité RGPD (article 20).
 *
 * Retourne un dump JSON complet de toutes les données stockées pour un lead :
 *  - fiche lead (PII déchiffrée)
 *  - LeadHistory
 *  - EmailEvent
 *  - InboxMessage (corps déchiffrés)
 *  - SequenceLead
 *
 * Téléchargement direct (Content-Disposition: attachment).
 */
import { z } from "zod";
import { handler, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { exportLead } from "@/lib/services/rgpd";
import { toScope, scopeError } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("rgpd:manage");
  const { id: rawId } = await params;
  const leadId = z.string().min(1).parse(rawId);

  const data = await exportLead(leadId, toScope(session)).catch(scopeError);
  if (!data) throw new ApiError(404, "Lead introuvable", "not_found");

  await audit({
    userId: session.sub,
    action: "rgpd.lead.export",
    entityType: "Lead",
    entityId: leadId,
    ip: clientIp(req),
  });

  const body = JSON.stringify(data, null, 2);
  const fileName = `lead-${leadId}-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
});
