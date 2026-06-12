import { z } from "zod";
import { handler, json, created, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { createTeam, listTeams } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const GET = handler(async () => {
  // Liste complète réservée à la gestion des utilisateurs (Paramètres → Équipes).
  await requirePermission("users:manage");
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
