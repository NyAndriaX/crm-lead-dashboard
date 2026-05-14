import { z } from "zod";
import { handler, json, noContent, parseBody, parseQuery, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteStage, updateStage } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().max(20).nullable().optional(),
});

const deleteQuerySchema = z.object({
  reassignTo: z.string().optional(),
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("pipeline:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  await updateStage(id, input);
  await audit({
    userId: session.sub,
    action: "pipeline.stage.update",
    entityType: "PipelineStage",
    entityId: id,
    ip: clientIp(req),
    diff: input,
  });
  return json({ data: { id } });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("pipeline:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const { reassignTo } = parseQuery(req, deleteQuerySchema);
  await deleteStage(id, reassignTo ? { reassignTo } : undefined);
  await audit({
    userId: session.sub,
    action: "pipeline.stage.delete",
    entityType: "PipelineStage",
    entityId: id,
    ip: clientIp(req),
    diff: { reassignTo: reassignTo ?? null },
  });
  return noContent();
});
