import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { scheduleCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const scheduleBodySchema = z.object({ scheduledAt: z.coerce.date().optional() });

export const POST = handler<Ctx>(async (req, { params }) => {
  await requirePermission("campaigns:send");
  const { id } = await params;
  const body = await parseBody(req, scheduleBodySchema);
  const row = await scheduleCampaign(id, body.scheduledAt);
  return json({ data: row });
});
