import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { aggregateCampaignStats, getCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const { id } = await params;
  await getCampaign(id, scope);
  const agg = await aggregateCampaignStats(id);
  return json({ data: agg });
});
