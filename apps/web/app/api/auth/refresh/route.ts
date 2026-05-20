import { cookies } from "next/headers";
import { prisma } from "@crm/db";
import { ApiError, handler, json } from "@/lib/api";
import {
  REFRESH_COOKIE, setAuthCookies, signAccessToken, signRefreshToken, verifyRefreshToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/auth/refresh — échange un refresh token (cookie) contre un nouvel access token.
export const POST = handler(async () => {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  const claims = token ? verifyRefreshToken(token) : null;
  if (!claims) throw new ApiError(401, "Refresh token invalide", "invalid_refresh");

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.isActive || user.tokenVersion !== claims.ver) {
    throw new ApiError(401, "Session expirée", "session_expired");
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, ver: user.tokenVersion });
  await setAuthCookies(accessToken, refreshToken);
  return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
