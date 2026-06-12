/**
 * POST /api/scraping/missions/:id/run — lance la mission (S-08).
 * Enfile un job worker `scraping-run`. Le worker passe la mission en
 * "running" puis "done"/"error".
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { enqueue } from "@/lib/jobs";
import { checkScraperReachable, isScrapingLiveEnabled } from "@/lib/scraping/scraperHealth";
import { getMission } from "@/lib/services/scraping";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);

  const scope = toScope(session);
  const mission = await getMission(id, scope);
  if (!mission) throw new ApiError(404, "Mission introuvable", "not_found");
  if (mission.status === "running" || mission.status === "queued") {
    throw new ApiError(409, "Mission déjà en cours", "already_running");
  }

  if (isScrapingLiveEnabled()) {
    const health = await checkScraperReachable();
    if (!health.ok) {
      throw new ApiError(
        503,
        `Scraper inaccessible sur ${health.url}. Lancez CRM_LEAD_SCRAPER : ./run.sh (port 8000). ${health.error ?? ""}`,
        "scraper_unreachable",
      );
    }
  }

  await prisma.scrapingMission.update({
    where: { id },
    data: { status: "queued", logs: `Mise en file le ${new Date().toISOString()}` },
  });
  await enqueue("scraping-run", { missionId: id }, { priority: 2 });

  await audit({
    userId: session.sub,
    action: "scraping.mission.run",
    entityType: "ScrapingMission",
    entityId: id,
    ip: clientIp(req),
  });
  return json({
    data: {
      queued: true,
      missionId: id,
      message:
        "Scraping lancé en arrière-plan. Vous recevrez une notification quand la récupération des leads sera terminée (cela peut prendre longtemps).",
    },
  });
});
