/**
 * POST /api/users/accept-invite — acceptation d'une invitation (U-01).
 *
 * Public (pas d'authentification requise) : reçoit { token, password }.
 * Si le token est valide, le user passe en `isActive: true`, le `passwordHash`
 * est mis à jour, l'`inviteToken` est nettoyé, et on ouvre une session.
 */
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@crm/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import {
  setAuthCookies, signAccessToken, signRefreshToken,
} from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";
import { permissionsFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128),
});

const INVITE_TTL_DAYS = 7;

export const POST = handler(async (req) => {
  const { token, password } = await parseBody(req, acceptSchema);

  const user = await prisma.user.findFirst({
    where: { inviteToken: token },
  });
  if (!user || !user.invitedAt) {
    throw new ApiError(400, "Invitation invalide ou déjà utilisée", "invalid_invite");
  }
  const expiresAt = new Date(user.invitedAt.getTime() + INVITE_TTL_DAYS * 24 * 3600 * 1000);
  if (expiresAt < new Date()) {
    throw new ApiError(400, "Invitation expirée — demandez à l'admin de vous renvoyer une invitation", "invite_expired");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      isActive: true,
      inviteToken: null,
      lastLoginAt: new Date(),
      tokenVersion: { increment: 1 }, // invalide d'éventuels tokens en circulation
    },
  });

  const accessToken = signAccessToken({
    sub: updated.id, role: updated.role, name: updated.name, email: updated.email,
  });
  const refreshToken = signRefreshToken({ sub: updated.id, ver: updated.tokenVersion });
  await setAuthCookies(accessToken, refreshToken);

  await audit({
    userId: updated.id,
    action: "user.invite_accepted",
    entityType: "User",
    entityId: updated.id,
    ip: clientIp(req),
  });

  return json({
    user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role },
    permissions: permissionsFor(updated.role),
  });
});
