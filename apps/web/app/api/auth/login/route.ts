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
    let secret: string | null = null;
    if (user.totpSecretEnc) {
      try {
        secret = decrypt(Buffer.from(user.totpSecretEnc));
      } catch {
        console.error("[auth/login] échec déchiffrement secret TOTP (clé PII ou données corrompues ?)", user.id);
        throw new ApiError(
          500,
          "Le second facteur ne peut pas être vérifié (données invalides ou clé de chiffrement incohérente). Un administrateur doit réinitialiser la 2FA pour ce compte.",
          "totp_decrypt_error",
        );
      }
    }
    if (!secret || !verifyTotp(totp, secret)) {
      await audit({ userId: user.id, action: "auth.login.totp_failed", ip });
      throw new ApiError(401, "Code 2FA invalide", "invalid_totp");
    }
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, ver: user.tokenVersion });
  try {
    await setAuthCookies(accessToken, refreshToken);
  } catch (cookieErr) {
    console.error("[auth/login] impossible de poser les cookies de session", cookieErr);
    throw new ApiError(
      500,
      "Impossible d'enregistrer la session (cookies). En production, accédez au site en HTTPS, vérifiez le domaine / SameSite, et que les cookies ne sont pas bloqués par le navigateur.",
      "session_cookie_error",
    );
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "auth.login.success", ip });

  return json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    permissions: permissionsFor(user.role),
  });
});
