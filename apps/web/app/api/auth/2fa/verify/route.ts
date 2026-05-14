/**
 * POST /api/auth/2fa/verify — finalise l'activation 2FA (U-04).
 *
 * Vérifie le code TOTP saisi par l'utilisateur contre le secret enrôlé via /setup.
 * Si OK : `twoFactorOn = true`, et la 2FA sera exigée au prochain login.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requireSession, parseBody, ApiError } from "@/lib/api";
import { verifyTotp } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  code: z.string().trim().min(6).max(10),
});

export const POST = handler(async (req) => {
  const session = await requireSession();
  const { code } = await parseBody(req, verifySchema);

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.totpSecretEnc) {
    throw new ApiError(400, "Aucun enrôlement 2FA en cours — lancez d'abord /setup", "no_setup");
  }
  const secret = decrypt(Buffer.from(user.totpSecretEnc));
  if (!verifyTotp(code, secret)) {
    throw new ApiError(401, "Code 2FA incorrect", "invalid_totp");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorOn: true },
  });

  await audit({
    userId: user.id,
    action: "auth.2fa.enabled",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
  });

  return json({ data: { enabled: true } });
});
