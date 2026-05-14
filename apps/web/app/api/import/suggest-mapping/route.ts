/**
 * POST /api/import/suggest-mapping
 *
 * Reçoit un tableau de headers détectés dans le fichier uploadé, retourne
 * un mapping `header → champ CRM` basé sur les alias FR/EN courants.
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { suggestMapping } from "@/lib/services/importTemplates";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  headers: z.array(z.string().min(1).max(120)).min(1).max(100),
});

export const POST = handler(async (req) => {
  await requirePermission("import:run");
  const { headers } = await parseBody(req, bodySchema);
  return json({ data: suggestMapping(headers) });
});
