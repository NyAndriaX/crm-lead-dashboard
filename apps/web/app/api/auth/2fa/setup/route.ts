/**
 * POST /api/auth/2fa/setup — démarre l'activation 2FA pour le user courant (U-04).
 *
 * Génère un secret TOTP, le stocke chiffré dans `User.totpSecretEnc` (sans activer
 * `twoFactorOn` tant qu'un code n'a pas été vérifié) et retourne :
 *  - le `secret` en clair (à recopier manuellement si l'app ne scanne pas)
 *  - le `otpauthUrl` (data URL → générera le QR côté UI via qrcode lib)
 *
 * Le secret reste inactif jusqu'à POST /api/auth/2fa/verify.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, requireSession, parseBody, ApiError } from "@/lib/api";
import { generateTotpSecret, totpKeyUri, verifyPassword } from "@/lib/auth";
import { encryptOrNull } from "@/lib/crypto";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Demande le mot de passe courant pour confirmer l'identité avant d'enrôler la 2FA.
const setupSchema = z.object({
  password: z.string().min(1),
});

export const POST = handler(async (req) => {
  const session = await requireSession();
  const { password } = await parseBody(req, setupSchema);

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable", "not_found");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "Mot de passe incorrect", "invalid_password");
  }
  if (user.twoFactorOn) {
    throw new ApiError(409, "La 2FA est déjà activée. Désactivez-la d'abord pour en générer une nouvelle.", "already_enabled");
  }

  const secret = generateTotpSecret();
  const otpauthUrl = totpKeyUri(secret, user.email);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptOrNull(secret) },
  });

  await audit({
    userId: user.id,
    action: "auth.2fa.setup_started",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
  });

  return json({ data: { secret, otpauthUrl } });
});
