import { prisma } from "@crm/db";
import { created, handler, json, jsonCached, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createTagSchema } from "@/lib/schemas/tag";

export const dynamic = "force-dynamic";

// GET /api/tags — référentiel des tags (CRM-015). Cache court : le référentiel
// change peu, cette route est appelée sur plusieurs pages (leads liste, fiche,
// bulk actions) — cache 60s + SWR 5min réduit la charge sans risque de stale.
export const GET = handler(async () => {
  await requirePermission("leads:read");
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return jsonCached({ data: tags }, { maxAge: 60, swr: 300 });
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
