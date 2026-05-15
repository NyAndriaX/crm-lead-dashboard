import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteMission, getMission, updateMission } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const configSchema = z.object({
  sources: z.array(z.enum(["google_maps", "directories", "linkedin", "website"])).min(1),
  keywords: z.string().trim().max(200),
  location: z.object({
    city: z.string().trim().max(80).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    radiusKm: z.number().int().min(0).max(2000).nullable().optional(),
  }),
  companyType: z.string().trim().max(80).nullable().optional(),
  companySize: z.string().trim().max(40).nullable().optional(),
  language: z.string().trim().max(10).nullable().optional(),
  limit: z.number().int().min(1).max(500),
  rate: z.object({
    delayMs: z.number().int().min(0).max(60000),
    retries: z.number().int().min(0).max(10),
    rotateUserAgent: z.boolean(),
    proxyUrl: z.string().trim().max(300).nullable().optional(),
  }),
  dailyQuota: z.number().int().min(1).max(1000).nullable().optional(),
  autoPipeline: z
    .object({
      enabled: z.boolean(),
      sequenceId: z.string().nullable().optional(),
    })
    .optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: configSchema.optional(),
  schedule: z.string().trim().max(50).nullable().optional(),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("import:run");
  const { id } = await params;
  const m = await getMission(z.string().min(1).parse(id));
  if (!m) throw new ApiError(404, "Mission introuvable", "not_found");
  return json({ data: m });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  await updateMission(id, input);
  await audit({
    userId: session.sub,
    action: "scraping.mission.update",
    entityType: "ScrapingMission",
    entityId: id,
    ip: clientIp(req),
  });
  return json({ data: await getMission(id) });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("import:run");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteMission(id);
  await audit({
    userId: session.sub,
    action: "scraping.mission.delete",
    entityType: "ScrapingMission",
    entityId: id,
    ip: clientIp(req),
  });
  return noContent();
});
