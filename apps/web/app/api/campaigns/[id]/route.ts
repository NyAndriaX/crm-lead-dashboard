import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { updateCampaignSchema } from "@/lib/schemas/campaign";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:read");
  const { id } = await params;
  return json({ data: await getCampaign(id) });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  await requirePermission("campaigns:write");
  const { id } = await params;
  const body = await parseBody(req, updateCampaignSchema);
  return json({ data: await updateCampaign(id, body) });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  await requirePermission("campaigns:write");
  const { id } = await params;
  await deleteCampaign(id);
  return noContent();
});
