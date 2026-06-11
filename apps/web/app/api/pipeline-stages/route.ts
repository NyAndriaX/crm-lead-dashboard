import { z } from "zod";
import { handler, jsonCached, created, parseBody, parseQuery, requirePermission, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";
import { scopeError, toScope } from "@/lib/scope";
import { createStage, listStages } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  ownerUserId: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().max(20).nullable().optional(),
});

export const GET = handler(async (req) => {
  // Lecture autorisée à tous les utilisateurs authentifiés (besoin pour vue Kanban).
  const s = await requireSession();
  if (!can(s.role, "pipeline:manage") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const { ownerUserId } = parseQuery(req, querySchema);
  const scope = toScope(s);
  try {
    const result = await listStages(scope, { ownerUserId });
    // P-01 : cache 30s + SWR 5min. Les étapes changent rarement.
    return jsonCached(
      { data: result.stages, readOnly: result.readOnly, ownerUserId: result.ownerUserId },
      { maxAge: 30, swr: 300 },
    );
  } catch (e) {
    scopeError(e);
  }
});

export const POST = handler(async (req) => {
  const session = await requirePermission("pipeline:manage");
  const scope = toScope(session);
  const input = await parseBody(req, createSchema);
  const stage = await createStage(input, scope);
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
