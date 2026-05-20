import { prisma } from "@crm/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import {
  setAuthCookies, signAccessToken, signRefreshToken, verifyPassword, verifyTotp,
} from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { audit, clientIp } from "@/lib/audit";
import { loginSchema } from "@/lib/schemas/auth";
import { permissionsFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// POST /api/auth/login — email + mot de passe (+ code TOTP si 2FA activé)
export const POST = handler(async (req) => {
  const { email, password, totp } = await parseBody(req, loginSchema);
  const ip = clientIp(req);

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const generic = new ApiError(401, "Identifiants invalides", "invalid_credentials");

  if (!user || !user.isActive) throw generic;
  if (!(await verifyPassword(password, user.passwordHash))) {
    await audit({ userId: user.id, action: "auth.login.failed", ip });
    throw generic;
  }
  if (user.twoFactorOn) {
    if (!totp) throw new ApiError(401, "Code 2FA requis", "totp_required");
    const secret = user.totpSecretEnc ? decrypt(Buffer.from(user.totpSecretEnc)) : null;
    if (!secret || !verifyTotp(totp, secret)) {
      await audit({ userId: user.id, action: "auth.login.totp_failed", ip });
      throw new ApiError(401, "Code 2FA invalide", "invalid_totp");
    }
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, ver: user.tokenVersion });
  await setAuthCookies(accessToken, refreshToken);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login.success", ip });

  return json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    permissions: permissionsFor(user.role),
  });
});
