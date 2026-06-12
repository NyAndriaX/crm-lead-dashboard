/**
 * POST /api/rgpd/leads/:id/erase — droit à l'oubli RGPD (article 17).
 *
 * Supprime DÉFINITIVEMENT un lead et toutes ses données associées (history,
 * events, inbox, sequences, pipeline). Action irréversible — réservée aux
 * ADMIN avec permission `rgpd:manage`.
 */
import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { eraseLead } from "@/lib/services/rgpd";
import { toScope, scopeError } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("rgpd:manage");
  const { id: rawId } = await params;
  const leadId = z.string().min(1).parse(rawId);

  const result = await eraseLead(leadId, toScope(session), session.sub).catch(scopeError);

  // Audit minimal sans PII (on conserve juste l'ID et les compteurs)
  await audit({
    userId: session.sub,
    action: "rgpd.lead.erase",
    entityType: "Lead",
    entityId: leadId,
    ip: clientIp(req),
    diff: { removed: result.removed } as object,
  });

  return json({ data: result });
});
