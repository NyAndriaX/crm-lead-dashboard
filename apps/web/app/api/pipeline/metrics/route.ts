import { handler, json, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { pipelineMetrics } from "@/lib/services/pipeline";

export const dynamic = "force-dynamic";

/** GET /api/pipeline/metrics — KPIs Kanban (PL-05). */
export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "pipeline:manage") && !can(s.role, "analytics:read") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const data = await pipelineMetrics();
  return json({ data });
});
