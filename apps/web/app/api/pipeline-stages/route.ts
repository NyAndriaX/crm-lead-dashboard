import { z } from "zod";
import { handler, json, created, parseBody, requirePermission, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";
import { createStage, listStages } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).nullable().optional(),
});

export const GET = handler(async () => {
  // Lecture autorisée à tous les utilisateurs authentifiés (besoin pour vue Kanban).
  const s = await requireSession();
  if (!can(s.role, "pipeline:manage") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const data = await listStages();
  return json({ data });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("pipeline:manage");
  const input = await parseBody(req, createSchema);
  const stage = await createStage(input);
  await audit({
    userId: session.sub,
    action: "pipeline.stage.create",
    entityType: "PipelineStage",
    entityId: stage.id,
    ip: clientIp(req),
    diff: input,
  });
  return created({ data: stage });
});
