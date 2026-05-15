/**
 * GET   /api/scraping/missions/:id/results?status=pending|accepted|rejected
 *       — leads scrapés en attente de validation (S-10).
 * PATCH /api/scraping/missions/:id/results — accepte/rejette une sélection.
 * POST  /api/scraping/missions/:id/results  — injecte les "accepted" dans le
 *       CRM avec re-dédoublonnage (S-07 + S-10).
 */
import { z } from "zod";
import { handler, json, parseBody, parseQuery, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { listBuffer, setBufferStatus, injectAcceptedLeads } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const querySchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
});

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(2000),
  status: z.enum(["accepted", "rejected"]),
});

export const GET = handler<Ctx>(async (req, { params }) => {
  await requirePermission("import:run");
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const { status } = parseQuery(req, querySchema);
  return json({ data: await listBuffer(missionId, status) });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const input = await parseBody(req, patchSchema);
  const count = await setBufferStatus(input.ids, input.status);
  await audit({
    userId: session.sub,
    action: "scraping.results.review",
    entityType: "ScrapingMission",
    entityId: missionId,
    ip: clientIp(req),
    diff: { status: input.status, count },
  });
  return json({ data: { updated: count } });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const result = await injectAcceptedLeads(missionId, session.sub);
  await audit({
    userId: session.sub,
    action: "scraping.results.inject",
    entityType: "ScrapingMission",
    entityId: missionId,
    ip: clientIp(req),
    diff: result,
  });
  return json({ data: result });
});
