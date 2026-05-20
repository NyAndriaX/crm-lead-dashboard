/**
 * POST /api/auth/2fa/disable — désactive la 2FA pour le user courant (U-04).
 *
 * Demande le mot de passe + un code TOTP en cours de validité pour confirmer
 * la possession effective des deux facteurs. Efface le secret stocké.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requireSession, parseBody, ApiError } from "@/lib/api";
import { verifyPassword, verifyTotp } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(10),
});

export const POST = handler(async (req) => {
  const session = await requireSession();
  const { password, code } = await parseBody(req, disableSchema);

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable", "not_found");
  if (!user.twoFactorOn || !user.totpSecretEnc) {
    throw new ApiError(400, "La 2FA n'est pas activée", "not_enabled");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "Mot de passe incorrect", "invalid_password");
  }
  const secret = decrypt(Buffer.from(user.totpSecretEnc));
  if (!verifyTotp(code, secret)) {
    throw new ApiError(401, "Code 2FA incorrect", "invalid_totp");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorOn: false, totpSecretEnc: null },
  });

  await audit({
    userId: user.id,
    action: "auth.2fa.disabled",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
  });

  return json({ data: { enabled: false } });
});
