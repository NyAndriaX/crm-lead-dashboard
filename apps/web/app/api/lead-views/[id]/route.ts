import { prisma } from "@crm/db";
import { ApiError, handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { updateLeadViewSchema } from "@/lib/schemas/leadView";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownView(id: string, userId: string) {
  const v = await prisma.leadView.findUnique({ where: { id } });
  if (!v) throw new ApiError(404, "Vue introuvable", "not_found");
  if (v.userId !== userId) throw new ApiError(403, "Vue appartenant à un autre utilisateur", "forbidden");
  return v;
}

// PUT /api/lead-views/:id — met à jour une vue (propriétaire uniquement).
export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("leads:read");
  const { id } = await params;
  await ownView(id, s.sub);
  const input = await parseBody(req, updateLeadViewSchema);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.columns !== undefined) data.columns = input.columns;
  if (input.shared !== undefined) data.shared = input.shared;
  if (input.filters !== undefined || input.sort !== undefined) {
    data.filters = { ...(input.filters ?? {}), ...(input.sort ? { sort: input.sort } : {}) };
  }
  const view = await prisma.leadView.update({ where: { id }, data });
  return json(view);
});

// DELETE /api/lead-views/:id — supprime une vue (propriétaire uniquement).
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("leads:read");
  const { id } = await params;
  await ownView(id, s.sub);
  await prisma.leadView.delete({ where: { id } });
  return noContent();
});
