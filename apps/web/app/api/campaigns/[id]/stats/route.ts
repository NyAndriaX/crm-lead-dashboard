import { handler, json, requirePermission } from "@/lib/api";
import { aggregateCampaignStats, getCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:read");
  const { id } = await params;
  await getCampaign(id);
  const agg = await aggregateCampaignStats(id);
  return json({ data: agg });
});
