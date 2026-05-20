import { prisma } from "@crm/db";
import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createLeadViewSchema } from "@/lib/schemas/leadView";

export const dynamic = "force-dynamic";

// GET /api/lead-views — vues personnalisées de l'utilisateur + vues partagées (CRM-017).
export const GET = handler(async () => {
  const s = await requirePermission("leads:read");
  const views = await prisma.leadView.findMany({
    where: { OR: [{ userId: s.sub }, { shared: true }] },
    orderBy: { createdAt: "desc" },
  });
  return json({ data: views });
});

// POST /api/lead-views — sauvegarde une vue (filtres + colonnes + tri).
export const POST = handler(async (req) => {
  const s = await requirePermission("leads:read");
  const input = await parseBody(req, createLeadViewSchema);
  const view = await prisma.leadView.create({
    data: {
      userId: s.sub,
      name: input.name,
      filters: { ...input.filters, ...(input.sort ? { sort: input.sort } : {}) } as object,
      columns: input.columns as object,
      shared: input.shared,
    },
  });
  return created(view);
});
