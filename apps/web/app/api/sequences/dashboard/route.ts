import { handler, json, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { toScope } from "@/lib/scope";
import { getSequencesDashboard } from "@/lib/services/sequences";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "sequences:manage") && !can(s.role, "analytics:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const scope = toScope(s);
  const data = await getSequencesDashboard(scope);
  return json({ data });
});
