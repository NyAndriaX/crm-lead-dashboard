/**
 * POST /api/scraping/missions/:id/import
 * Corps : enveloppe crm-leads-scraper `{ ok, results[] }` ou `results[]` seul.
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { importScraperPayloadToBuffer } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.union([
  z.object({
    ok: z.boolean().optional(),
    results: z.array(z.record(z.unknown())).min(1),
  }),
  z.object({ results: z.array(z.record(z.unknown())).min(1) }),
  z.array(z.record(z.unknown())).min(1),
]);

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const { id: missionId } = await params;
  z.string().min(1).parse(missionId);
  const payload = await parseBody(req, bodySchema);
  const result = await importScraperPayloadToBuffer(missionId, payload);
  await audit({
    userId: session.sub,
    action: "scraping.results.import",
    entityType: "ScrapingMission",
    entityId: missionId,
    ip: clientIp(req),
    diff: result,
  });
  return json({ data: result });
});
