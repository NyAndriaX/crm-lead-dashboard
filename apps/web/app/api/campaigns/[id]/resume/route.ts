import { handler, json, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { resumeCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (_req, { params }) => {
  const s = await requirePermission("campaigns:send");
  const scope = toScope(s);
  const { id } = await params;
  return json({ data: await resumeCampaign(id, scope) });
});
