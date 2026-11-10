import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { generateScrapingPlan } from "@/lib/services/scrapingPlan";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  brief: z.string().trim().min(10, "Décrivez votre cible en une ou deux phrases").max(2000),
  country: z.string().trim().max(80).optional().default("France"),
  locale: z.string().trim().max(12).optional().default("fr-FR"),
});

/** POST /api/scraping/plan — plan de mission généré par Claude (skill crm-scraping-plan). */
export const POST = handler(async (req) => {
  await requirePermission("import:run");
  const body = await parseBody(req, bodySchema);
  return json({ data: await generateScrapingPlan(body) });
});
