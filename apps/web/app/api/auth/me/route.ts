import { prisma } from "@crm/db";
import { handler, json, requireSession } from "@/lib/api";
import { permissionsFor, ensureRbacLoaded } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/auth/me — utilisateur courant + permissions effectives + état 2FA.
export const GET = handler(async () => {
  const s = await requireSession();
  await ensureRbacLoaded();
  const profile = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { name: true, twoFactorOn: true, teamId: true, lastLoginAt: true },
  });
  return json({
    user: {
      id: s.sub,
      name: profile?.name ?? s.name,
      email: s.email,
      role: s.role,
      twoFactorOn: profile?.twoFactorOn ?? false,
      teamId: profile?.teamId ?? null,
      lastLoginAt: profile?.lastLoginAt ?? null,
    },
    permissions: permissionsFor(s.role),
  });
});
