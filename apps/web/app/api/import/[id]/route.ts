/**
 * GET    /api/import/:id — statut d'un import (polling).
 * DELETE /api/import/:id — supprime l'import et le fichier.
 */
import { handler, json, noContent, requirePermission, requireSession } from "@/lib/api";
import { getImportJob, deleteImportJob } from "@/lib/services/import";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireSession();
  const job = await getImportJob(id, session.sub, session.role === "ADMIN");
  return json({ data: job });
});

export const DELETE = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requirePermission("import:run");
  await deleteImportJob(id, session.sub, session.role === "ADMIN");
  return noContent();
});
