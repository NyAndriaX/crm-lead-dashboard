import { z } from "zod";
import { handler, json, created, parseBody, requirePermission, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";
import { createMission, listMissions } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

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
  detailed: z.boolean().optional().default(true),
  locale: z.string().trim().max(12).optional().default("fr-FR"),
  filter_country: z.boolean().optional().default(true),
  requireEmail: z.boolean().optional().default(true),
  dailyQuota: z.number().int().min(1).max(1000).nullable().optional(),
  injectionTags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  autoPipeline: z
    .object({
      enabled: z.boolean(),
      sequenceId: z.string().nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    })
    .optional(),
  schedulePlan: schedulePlanSchema.optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  config: configSchema,
});

export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "import:run") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  return json({ data: await listMissions() });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("import:run");
  const input = await parseBody(req, createSchema);
  const mission = await createMission({ name: input.name, config: input.config });
  await audit({
    userId: session.sub,
    action: "scraping.mission.create",
    entityType: "ScrapingMission",
    entityId: mission.id,
    ip: clientIp(req),
    diff: {
      name: input.name,
      keywords: input.config.keywords,
      schedule: input.config.schedulePlan?.mode,
      requireEmail: input.config.requireEmail,
    },
  });
  return created({ data: mission });
});
