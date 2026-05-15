import { z } from "zod";
import { handler, json, created, parseBody, requirePermission, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";
import { createMission, listMissions, SCRAPING_SOURCES } from "@/lib/services/scraping";

export const dynamic = "force-dynamic";

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
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  config: configSchema,
  schedule: z.string().trim().max(50).nullable().optional(),
});

export const GET = handler(async () => {
  const s = await requireSession();
  if (!can(s.role, "import:run") && !can(s.role, "leads:read")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  return json({ data: await listMissions(), sources: SCRAPING_SOURCES });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("import:run");
  const input = await parseBody(req, createSchema);
  const mission = await createMission(input);
  await audit({
    userId: session.sub,
    action: "scraping.mission.create",
    entityType: "ScrapingMission",
    entityId: mission.id,
    ip: clientIp(req),
    diff: { name: input.name, sources: input.config.sources },
  });
  return created({ data: mission });
});
