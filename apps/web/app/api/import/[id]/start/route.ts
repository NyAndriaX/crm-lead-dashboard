/**
 * POST /api/import/:id/start — confirme le mapping et lance le traitement worker.
 * Body : { mapping, skipDuplicates?, defaultSource?, defaultTags? }
 */
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { startImportSchema } from "@/lib/schemas/import";
import { startImportJob } from "@/lib/services/import";

export const dynamic = "force-dynamic";

export const POST = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requirePermission("import:run");
  const input = await parseBody(req, startImportSchema);
  const job = await startImportJob(id, session.sub, input);
  return json({ data: job });
});
