import { prisma } from "@crm/db";
import { handler } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { env } from "@/lib/env";
import { can } from "@/lib/rbac";
import { exchangeGmailCode, readGmailState, saveGmailAccount } from "@/lib/services/gmailOAuth";

export const dynamic = "force-dynamic";

/**
 * Retour vers Configuration › Emailing. Navigation déclenchée par une page du site (et non par une
 * redirection HTTP depuis Google) : le cookie de session SameSite=Strict est alors bien envoyé.
 */
function back(params: Record<string, string>) {
  const url = `${env().APP_BASE_URL.replace(/\/$/, "")}/settings?${new URLSearchParams(params).toString()}#emailing`;
  const safe = JSON.stringify(url).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>CRM Lead</title></head><body style="font-family:system-ui,sans-serif;padding:32px;color:#1e2538">
<p>Retour vers CRM Lead…</p><p><a href="${url.replace(/"/g, "&quot;")}">Continuer</a></p>
<script>location.replace(${safe});</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// GET /api/integrations/gmail/callback — retour de Google : enregistre le compte d'envoi « Gmail (API) ».
export const GET = handler(async (req) => {
  const u = new URL(req.url);
  const error = u.searchParams.get("error");
  if (error) return back({ gmail: "error", reason: error === "access_denied" ? "Autorisation refusée." : error });

  const userId = readGmailState(u.searchParams.get("state") ?? "");
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true } }) : null;
  if (!user || !user.isActive || !can(user.role, "settings:manage")) {
    return back({ gmail: "error", reason: "Lien expiré ou invalide, recommencez depuis Configuration › Emailing." });
  }
  const code = u.searchParams.get("code");
  if (!code) return back({ gmail: "error", reason: "Réponse de Google incomplète, recommencez." });

  try {
    const { email, refreshToken } = await exchangeGmailCode(code);
    const account = await saveGmailAccount({ email, refreshToken, userId: user.id });
    await audit({ userId: user.id, action: "smtp.gmail.connect", entityType: "SmtpConfig", entityId: account.id, ip: clientIp(req) });
    return back({ gmail: "connected", account: email });
  } catch (e) {
    return back({ gmail: "error", reason: e instanceof Error ? e.message.slice(0, 200) : "Échec de la connexion Gmail." });
  }
});
