import { prisma } from "@crm/db";
import { handler, noContent } from "@/lib/api";
import { clearAuthCookies, getSession } from "@/lib/auth";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — invalide les cookies et force l'expiration des refresh tokens.
export const POST = handler(async (req) => {
  const session = await getSession();
  if (session) {
    await prisma.user.update({ where: { id: session.sub }, data: { tokenVersion: { increment: 1 } } });
    await audit({ userId: session.sub, action: "auth.logout", ip: clientIp(req) });
  }
  await clearAuthCookies();
  return noContent();
});
