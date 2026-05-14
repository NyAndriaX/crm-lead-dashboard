import { z } from "zod";
import { handler, json, created, parseBody, requirePermission, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";
import { createTeam, listTeams } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const GET = handler(async () => {
  // Lecture autorisée à tout utilisateur authentifié (besoin pour les sélecteurs
  // d'assignation et la visibilité d'équipe).
  const s = await requireSession();
  if (!can(s.role, "users:manage") && !can(s.role, "leads:assign")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const data = await listTeams();
  return json({ data });
});

export const POST = handler(async (req) => {
  const session = await requirePermission("users:manage");
  const input = await parseBody(req, createSchema);
  const team = await createTeam(input.name);
  await audit({
    userId: session.sub,
    action: "team.create",
    entityType: "Team",
    entityId: team.id,
    ip: clientIp(req),
    diff: { name: input.name },
  });
  return created({ data: team });
});
