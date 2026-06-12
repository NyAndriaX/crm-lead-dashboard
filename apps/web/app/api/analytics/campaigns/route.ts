import { handler, json, requirePermission } from "@/lib/api";
import { listCampaignReports } from "@/lib/services/analytics";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requirePermission("analytics:read");
  const data = await listCampaignReports(toScope(session));
  return json({ data });
});
