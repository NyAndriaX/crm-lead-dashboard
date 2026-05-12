import { handler, json, requireSession } from "@/lib/api";
import { permissionsFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/auth/me — utilisateur courant + permissions effectives.
export const GET = handler(async () => {
  const s = await requireSession();
  return json({
    user: { id: s.sub, name: s.name, email: s.email, role: s.role },
    permissions: permissionsFor(s.role),
  });
});
