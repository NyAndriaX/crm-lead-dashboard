/**
 * GET /api/import/template?id=<TemplateId>&format=xlsx|csv
 *
 * Télécharge l'un des modèles d'import définis dans services/importTemplates.ts.
 * `id` par défaut : "basic". `format` par défaut : "xlsx".
 *
 * XLSX = 2 feuilles (Leads + Guide colonnes). CSV = 1 feuille avec BOM Excel FR.
 */
import { z } from "zod";
import { handler, parseQuery, requirePermission } from "@/lib/api";
import {
  buildTemplateCsv, buildTemplateXlsx, TEMPLATES, type TemplateId,
} from "@/lib/services/importTemplates";

export const dynamic = "force-dynamic";

const TEMPLATE_IDS = Object.keys(TEMPLATES) as [TemplateId, ...TemplateId[]];

const querySchema = z.object({
  id: z.enum(TEMPLATE_IDS).optional().default("basic"),
  format: z.enum(["xlsx", "csv"]).optional().default("xlsx"),
});

export const GET = handler(async (req) => {
  await requirePermission("import:run");
  const { id, format } = parseQuery(req, querySchema);
  const fileBase = `modele-import-${id}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    return new Response(buildTemplateCsv(id), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  const buf = buildTemplateXlsx(id);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
});
