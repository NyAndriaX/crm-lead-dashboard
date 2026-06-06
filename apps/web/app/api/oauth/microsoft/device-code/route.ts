/**
 * POST /api/oauth/microsoft/device-code
 * Lance le device code flow Microsoft OAuth pour IMAP ou SMTP.
 * Body : { tenantId, clientId, clientSecret }
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { startDeviceCodeFlow } from "@crm/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, bodySchema);
  const device = await startDeviceCodeFlow(input);
  return json({ data: device });
});
