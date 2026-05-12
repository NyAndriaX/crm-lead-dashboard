import { prisma } from "@crm/db";
import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createTagSchema } from "@/lib/schemas/tag";

export const dynamic = "force-dynamic";

// GET /api/tags — référentiel des tags (CRM-015).
export const GET = handler(async () => {
  await requirePermission("leads:read");
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return json({ data: tags });
});

// POST /api/tags — crée un tag prédéfini.
export const POST = handler(async (req) => {
  const s = await requirePermission("leads:write");
  const input = await parseBody(req, createTagSchema);
  const existing = await prisma.tag.findUnique({ where: { name: input.name } });
  if (existing) return json(existing);
  const tag = await prisma.tag.create({ data: { name: input.name, color: input.color } });
  await audit({ userId: s.sub, action: "tag.create", entityType: "tag", entityId: tag.id, ip: clientIp(req) });
  return created(tag);
});
