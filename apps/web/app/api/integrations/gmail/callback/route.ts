import { NextResponse } from "next/server";
import { handler, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { env } from "@/lib/env";
import { exchangeGmailCode, saveGmailAccount, verifyGmailState } from "@/lib/services/gmailOAuth";

export const dynamic = "force-dynamic";

function back(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${env().APP_BASE_URL.replace(/\/$/, "")}/settings?${q}#emailing`);
}

// GET /api/integrations/gmail/callback — retour de Google : enregistre le compte d'envoi « Gmail (API) ».
export const GET = handler(async (req) => {
  const s = await requirePermission("settings:manage");
  const u = new URL(req.url);
  const error = u.searchParams.get("error");
  if (error) return back({ gmail: "error", reason: error === "access_denied" ? "Autorisation refusée." : error });
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state") ?? "";
  if (!code || !verifyGmailState(state, s.sub)) return back({ gmail: "error", reason: "Lien expiré ou invalide, recommencez." });
  try {
    const { email, refreshToken } = await exchangeGmailCode(code);
    const account = await saveGmailAccount({ email, refreshToken, userId: s.sub });
    await audit({ userId: s.sub, action: "smtp.gmail.connect", entityType: "SmtpConfig", entityId: account.id, ip: clientIp(req) });
    return back({ gmail: "connected", account: email });
  } catch (e) {
    return back({ gmail: "error", reason: e instanceof Error ? e.message.slice(0, 200) : "Échec de la connexion Gmail." });
  }
});
