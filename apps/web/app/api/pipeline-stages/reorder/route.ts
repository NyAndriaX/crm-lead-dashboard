import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { reorderStages } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

const schema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(50),
});

/** PUT /api/pipeline-stages/reorder — réordonne les étapes (drag-drop des colonnes). */
export const PUT = handler(async (req) => {
  const session = await requirePermission("pipeline:manage");
  const input = await parseBody(req, schema);
  await reorderStages(input.orderedIds);
  await audit({
    userId: session.sub,
    action: "pipeline.stage.reorder",
    entityType: "PipelineStage",
    ip: clientIp(req),
    diff: input,
  });
  return json({ data: { reordered: input.orderedIds.length } });
});
