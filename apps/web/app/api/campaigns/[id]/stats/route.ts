import { handler, json, requirePermission } from "@/lib/api";
import { aggregateCampaignStats, campaignAbComparison, getCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:read");
  const { id } = await params;
  await getCampaign(id);
  const [agg, ab] = await Promise.all([aggregateCampaignStats(id), campaignAbComparison(id)]);
  // M-13 : `ab` = comparatif par variante + variante gagnante (null hors test A/B).
  return json({ data: { ...agg, ab } });
});
