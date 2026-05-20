/**
 * POST /api/users/:id/reset-2fa — désactive la 2FA d'un user via un admin (U-04).
 *
 * Cas d'usage : un user a perdu son téléphone / authenticator. L'admin réinitialise
 * la 2FA sans demander le code TOTP (action sensible, auditée).
 * Le user devra réenrôler son 2FA s'il veut la conserver.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);

  const user = await prisma.user.update({
    where: { id },
    data: {
      twoFactorOn: false,
      totpSecretEnc: null,
      tokenVersion: { increment: 1 }, // force re-login pour la sécurité
    },
    select: { id: true, name: true, email: true, twoFactorOn: true },
  });

  await audit({
    userId: session.sub,
    action: "user.reset_2fa",
    entityType: "User",
    entityId: id,
    ip: clientIp(req),
  });

  return json({ data: user });
});
