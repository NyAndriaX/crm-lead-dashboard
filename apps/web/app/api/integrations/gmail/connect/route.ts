import { NextResponse } from "next/server";
import { ApiError, handler, requirePermission } from "@/lib/api";
import { gmailAuthorizeUrl, signGmailState } from "@/lib/services/gmailOAuth";

export const dynamic = "force-dynamic";

// GET /api/integrations/gmail/connect — redirige vers l'écran d'autorisation Google (envoi par API Gmail).
export const GET = handler(async () => {
  const s = await requirePermission("settings:manage");
  const url = gmailAuthorizeUrl(signGmailState(s.sub));
  if (!url) {
    throw new ApiError(503, "Client OAuth Google non configuré (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).", "gmail_oauth_missing");
  }
  return NextResponse.redirect(url);
});
