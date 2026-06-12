import { z } from "zod";
import { handler, json, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { eraseArchivedLead } from "@/lib/services/rgpd";
import { toScope, scopeError } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("rgpd:manage");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);
  const data = await eraseArchivedLead(id, toScope(session), session.sub).catch(scopeError);
  await audit({
    userId: session.sub,
    action: "rgpd.archived.erase",
    entityType: "Lead",
    entityId: id,
    ip: clientIp(req),
  });
  return json({ data });
});
