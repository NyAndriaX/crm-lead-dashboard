import { z } from "zod";
import { handler, json, parseQuery, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { scopeError, toScope } from "@/lib/scope";
import { pipelineMetrics } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  ownerUserId: z.string().trim().min(1).optional(),
});

/** GET /api/analytics/pipeline — métriques pipeline + potentiel commercial EUR. */
export const GET = handler(async (req) => {
  const s = await requireSession();
  if (!can(s.role, "analytics:read") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const { ownerUserId } = parseQuery(req, querySchema);
  const scope = toScope(s);
  try {
    const data = await pipelineMetrics(scope, { ownerUserId });
    return json({ data });
  } catch (e) {
    scopeError(e);
  }
});
