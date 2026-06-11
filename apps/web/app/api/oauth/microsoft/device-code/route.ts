/**
 * POST /api/oauth/microsoft/device-code
 * Lance le device code flow Microsoft OAuth pour IMAP ou SMTP.
 * Body : { tenantId, clientId, clientSecret }
 */
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { msOAuthCredsSchema, parseMsOAuthCreds } from "@/lib/oauth/microsoftSchemas";
import { startDeviceCodeFlow } from "@crm/db";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, msOAuthCredsSchema);
  const creds = parseMsOAuthCreds(input);
  const device = await startDeviceCodeFlow(creds);
  return json({ data: device });
});
