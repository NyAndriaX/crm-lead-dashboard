import { handler, json, noContent, parseBody, requirePermission } from "@/lib/api";
import { updateCampaignSchema } from "@/lib/schemas/campaign";
import { toScope } from "@/lib/scope";
import { deleteCampaign, getCampaign, updateCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  const { id } = await params;
  return json({ data: await getCampaign(id, scope) });
});

export const PUT = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const { id } = await params;
  const body = await parseBody(req, updateCampaignSchema);
  return json({ data: await updateCampaign(id, body, scope) });
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const { id } = await params;
  await deleteCampaign(id, scope);
  return noContent();
});
