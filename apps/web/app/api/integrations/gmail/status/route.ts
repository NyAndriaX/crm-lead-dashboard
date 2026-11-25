import { googleOAuthClient } from "@crm/db";
import { handler, json, requirePermission } from "@/lib/api";
import { gmailRedirectUri } from "@/lib/services/gmailOAuth";

export const dynamic = "force-dynamic";

// GET /api/integrations/gmail/status — le client OAuth Google est-il configuré ? (+ URI de redirection à déclarer)
export const GET = handler(async () => {
  await requirePermission("settings:manage");
  return json({ data: { configured: googleOAuthClient() !== null, redirectUri: gmailRedirectUri() } });
});
