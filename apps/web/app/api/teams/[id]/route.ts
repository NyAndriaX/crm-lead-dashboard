import { z } from "zod";
import { handler, json, noContent, parseBody, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { deleteTeam, getTeam, renameTeam } from "@/lib/services/teams";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const team = await getTeam(id);
  if (!team) throw new ApiError(404, "Équipe introuvable", "not_found");
  return json({ data: team });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const input = await parseBody(req, updateSchema);
  await renameTeam(id, input.name);
  await audit({
    userId: session.sub,
    action: "team.rename",
    entityType: "Team",
    entityId: id,
    ip: clientIp(req),
    diff: { name: input.name },
  });
  const team = await getTeam(id);
  return json({ data: team });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("users:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  await deleteTeam(id);
  await audit({
    userId: session.sub,
    action: "team.delete",
    entityType: "Team",
    entityId: id,
    ip: clientIp(req),
  });
  return noContent();
});
