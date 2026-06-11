import { created, handler, json, parseBody, requirePermission } from "@/lib/api";
import { createCampaignSchema } from "@/lib/schemas/campaign";
import { toScope } from "@/lib/scope";
import { createCampaign, listCampaigns } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await requirePermission("campaigns:read");
  const scope = toScope(s);
  return json({ data: await listCampaigns(scope) });
});

export const POST = handler(async (req) => {
  const s = await requirePermission("campaigns:write");
  const scope = toScope(s);
  const body = await parseBody(req, createCampaignSchema);
  const row = await createCampaign(body, scope);
  return created({ data: row });
});
