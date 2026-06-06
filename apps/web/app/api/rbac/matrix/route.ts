/**
 * GET /api/rbac/matrix — matrice rôle × permission (lecture).
 * PUT /api/rbac/matrix — mise à jour (settings:manage, ADMIN recommandé).
 */
import { z } from "zod";
import { getRbacMatrix, saveRbacMatrix, RBAC_ROLES, ALL_PERMISSIONS } from "@crm/db";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { invalidateRbacCache } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  matrix: z.record(z.string(), z.array(z.string())),
});

export const GET = handler(async () => {
  await requirePermission("settings:manage");
  const matrix = await getRbacMatrix();
  return json({ data: { matrix, roles: RBAC_ROLES, permissions: ALL_PERMISSIONS } });
});

export const PUT = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const { matrix } = await parseBody(req, updateSchema);
  const saved = await saveRbacMatrix(matrix, session.sub);
  invalidateRbacCache(saved);
  return json({ data: { matrix: saved } });
});
