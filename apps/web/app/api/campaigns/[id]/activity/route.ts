import { handler, json, requirePermission } from "@/lib/api";
import { campaignActivity, getCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/activity — série quotidienne sur 30 jours + derniers événements.
export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:read");
  const { id } = await params;
  await getCampaign(id);
  return json({ data: await campaignActivity(id) });
});
