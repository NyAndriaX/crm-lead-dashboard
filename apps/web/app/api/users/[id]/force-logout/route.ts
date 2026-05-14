/**
 * POST /api/users/:id/force-logout — déconnexion forcée d'un user par un admin (U-04).
 *
 * Incrémente `tokenVersion` → invalide tous les refresh tokens en circulation.
 * Le user devra se reconnecter à la prochaine tentative.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);

  if (session.sub === id) {
    throw new ApiError(400, "Utilisez /api/auth/logout pour vous déconnecter vous-même.", "self_logout");
  }

  const user = await prisma.user.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true, name: true, email: true, tokenVersion: true },
  });

  await audit({
    userId: session.sub,
    action: "user.force_logout",
    entityType: "User",
    entityId: id,
    ip: clientIp(req),
  });

  return json({ data: user });
});
