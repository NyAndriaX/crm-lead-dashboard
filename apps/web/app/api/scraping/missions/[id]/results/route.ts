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
import { listBuffer, setBufferStatus, injectAcceptedLeads, resolveInjectionTags, getMission } from "@/lib/services/scraping";
import { toScope } from "@/lib/scope";

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
  const session = await requirePermission("import:run");
  const scope = toScope(session);
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const { status } = parseQuery(req, querySchema);
  return json({ data: await listBuffer(missionId, scope, status) });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const scope = toScope(session);
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const input = await parseBody(req, patchSchema);
  const count = await setBufferStatus(missionId, input.ids, input.status, scope);
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

const injectSchema = z.object({
  injectionTags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const scope = toScope(session);
  const { id } = await params;
  const missionId = z.string().min(1).parse(id);
  const body = await req.json().catch(() => ({}));
  const { injectionTags } = injectSchema.parse(body);
  const mission = await getMission(missionId, scope);
  const mergedTags = resolveInjectionTags(mission?.config, injectionTags);
  const result = await injectAcceptedLeads(missionId, scope, session.sub, mergedTags);
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
