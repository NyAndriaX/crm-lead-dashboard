import { handler, json, requirePermission } from "@/lib/api";
import { listCampaignReports } from "@/lib/services/analytics";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("analytics:read");
  const data = await listCampaignReports();
  return json({ data });
});
