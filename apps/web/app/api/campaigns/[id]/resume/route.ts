import { handler, json, requirePermission } from "@/lib/api";
import { resumeCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:send");
  const { id } = await params;
  return json({ data: await resumeCampaign(id) });
});
