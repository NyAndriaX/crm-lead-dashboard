import { prisma } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/users — liste des utilisateurs actifs (pour les sélecteurs d'assignation).
// CRUD complet des utilisateurs : module Configuration (CRM-071).
export const GET = handler(async () => {
  await requirePermission("leads:assign");
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return json({ data: users });
});
