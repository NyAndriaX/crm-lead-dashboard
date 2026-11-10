import { getAiConfig, isAiEnabled } from "@crm/ai";
import { handler, json, requirePermission } from "@/lib/api";
import { checkScraperReachable, isScrapingLiveEnabled } from "@/lib/scraping/scraperHealth";

export const dynamic = "force-dynamic";

/** GET /api/scraping/status — disponibilité du scraper et de l'IA (bandeau de la page Scraping). */
export const GET = handler(async () => {
  await requirePermission("import:run");
  const scraper = isScrapingLiveEnabled() ? await checkScraperReachable() : null;
  return json({
    data: {
      live: isScrapingLiveEnabled(),
      scraper: scraper ? { ok: scraper.ok, error: scraper.error ?? null } : null,
      ai: await isAiEnabled(),
      aiProvider: (await getAiConfig()).provider.label,
    },
  });
});
