import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { getTeam, setTeamMembers } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const putSchema = z.object({
  userIds: z.array(z.string()).default([]),
});

/** PUT /api/teams/:id/members — remplace la liste complète des membres (idempotent). */
export const PUT = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, putSchema);
  await setTeamMembers(id, input.userIds);
  await audit({
    userId: session.sub,
    action: "team.members_set",
    entityType: "Team",
    entityId: id,
    ip: clientIp(req),
    diff: { userIds: input.userIds },
  });
  const team = await getTeam(id);
  return json({ data: team });
});
