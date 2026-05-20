import { handler, json, requirePermission } from "@/lib/api";
import { listTemplateMeta } from "@/lib/services/importTemplates";

export const dynamic = "force-dynamic";

/** GET /api/import/templates — liste des modèles disponibles. */
export const GET = handler(async () => {
  await requirePermission("import:run");
  return json({ data: listTemplateMeta() });
});
