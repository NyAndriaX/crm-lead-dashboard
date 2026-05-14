import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createCampaignSchema } from "@/lib/schemas/campaign";
import { createCampaign, listCampaigns } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("campaigns:read");
  return json({ data: await listCampaigns() });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("campaigns:write");
  const body = await parseBody(req, createCampaignSchema);
  const row = await createCampaign(body, s.sub);
  return created({ data: row });
});
