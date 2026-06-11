import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { scheduleCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const scheduleBodySchema = z.object({ scheduledAt: z.coerce.date().optional() });

export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("campaigns:send");
  const scope = toScope(s);
  const { id } = await params;
  const body = await parseBody(req, scheduleBodySchema);
  const row = await scheduleCampaign(id, scope, body.scheduledAt);
  return json({ data: row });
});
