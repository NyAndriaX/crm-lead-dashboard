import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { entityId } from "@/lib/schemas/common";
import { retryFailedCampaign } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ smtpConfigId: entityId.optional().nullable() });

// POST /api/campaigns/:id/retry-failed — renvoie aux seuls destinataires en échec (compte d'envoi au choix).
export const POST = handler<Ctx>(async (req, { params }) => {
  const s = await requirePermission("campaigns:send");
  const { id } = await params;
  const body = await parseBody(req, bodySchema);
  const res = await retryFailedCampaign(id, body.smtpConfigId ?? null);
  await audit({ userId: s.sub, action: "campaign.retry_failed", entityType: "Campaign", entityId: id, ip: clientIp(req), diff: { retried: res.retried, smtpConfigId: body.smtpConfigId ?? null } });
  return json({ data: { retried: res.retried, status: res.campaign.status } });
});
