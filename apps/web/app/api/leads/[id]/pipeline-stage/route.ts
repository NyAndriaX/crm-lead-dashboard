/**
 * POST /api/leads/:id/pipeline-stage — déplace un lead vers une étape (PL-03).
 *
 * Effets :
 *  - Lead.pipelineStageId mis à jour.
 *  - LeadPipeline upsertée (leadId unique) avec stageId + position + enteredAt.
 *  - Si l'étape cible a un nom standard (Nouveau, Contacté, Qualifié,
 *    Négociation/En discussion, Gagné, Perdu) → Lead.status synchronisé.
 *  - LeadHistory enregistrée ("stage_change" ou "stage_and_status_change").
 *  - Lead.lastActionAt = now.
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { scopeError, toScope } from "@/lib/scope";
import { moveLeadToStage } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().min(0).max(10_000).optional(),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("pipeline:manage");
  const scope = toScope(session);
  const { id: rawId } = await params;
  const leadId = z.string().min(1).parse(rawId);
  const input = await parseBody(req, schema);

  try {
    const result = await moveLeadToStage({
      leadId,
      stageId: input.stageId,
      position: input.position,
      scope,
      userId: session.sub,
    });
    await audit({
      userId: session.sub,
      action: result.statusChanged ? "lead.stage_and_status_change" : "lead.stage_change",
      entityType: "Lead",
      entityId: leadId,
      ip: clientIp(req),
      diff: { stageId: input.stageId, position: input.position ?? null, statusChanged: result.statusChanged, newStatus: result.status },
    });
    return json({ data: result });
  } catch (e) {
    scopeError(e);
  }
});
