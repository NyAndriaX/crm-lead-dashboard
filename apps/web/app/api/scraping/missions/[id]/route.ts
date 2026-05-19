import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteMission, getMission, updateMission } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const schedulePlanSchema = z.object({
  mode: z.enum(["manual", "once", "recurring"]),
  runAt: z.string().nullable().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
});

const configSchema = z.object({
  keywords: z.string().trim().min(1).max(200),
  location: z.object({
    city: z.string().trim().max(80).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    radiusKm: z.number().int().min(0).max(2000).nullable().optional(),
  }),
  limit: z.number().int().min(1).max(120),
  detailed: z.boolean().optional(),
  locale: z.string().trim().max(12).optional(),
  filter_country: z.boolean().optional(),
  requireEmail: z.boolean().optional(),
  dailyQuota: z.number().int().min(1).max(1000).nullable().optional(),
  autoPipeline: z
    .object({
      enabled: z.boolean(),
      sequenceId: z.string().nullable().optional(),
    })
    .optional(),
  schedulePlan: schedulePlanSchema.optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: configSchema.optional(),
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
