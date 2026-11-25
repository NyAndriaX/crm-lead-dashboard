/**
 * Connexion d'un compte Gmail en envoi par API (OAuth 2.0, scope gmail.send).
 *
 * Parcours : Configuration › Emailing › « Connecter un compte Gmail » → /api/integrations/gmail/connect
 * (redirection vers Google) → /api/integrations/gmail/callback (échange du code, enregistrement du compte
 * d'envoi « Gmail (API) » avec le jeton de rafraîchissement chiffré comme mot de passe).
 */
import jwt from "jsonwebtoken";
import { GMAIL_API_HOST, GMAIL_SEND_SCOPE, googleOAuthClient, prisma } from "@crm/db";
import { encryptOrNull } from "@/lib/crypto";
import { env } from "@/lib/env";

export function gmailRedirectUri(): string {
  return `${env().APP_BASE_URL.replace(/\/$/, "")}/api/integrations/gmail/callback`;
}

export function signGmailState(userId: string): string {
  return jwt.sign({ sub: userId, typ: "gmail_oauth" }, env().AUTH_JWT_SECRET, { expiresIn: "10m" });
}

export function verifyGmailState(state: string, userId: string): boolean {
  try {
    const p = jwt.verify(state, env().AUTH_JWT_SECRET) as { sub?: string; typ?: string };
    return p.typ === "gmail_oauth" && p.sub === userId;
  } catch {
    return false;
  }
}

export function gmailAuthorizeUrl(state: string): string | null {
  const client = googleOAuthClient();
  if (!client) return null;
  const q = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: `openid email ${GMAIL_SEND_SCOPE}`,
    access_type: "offline", // jeton de rafraîchissement
    prompt: "consent", // le redonne même si déjà accordé
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** Échange le code contre les jetons et renvoie l'adresse Gmail + le jeton de rafraîchissement. */
export async function exchangeGmailCode(code: string): Promise<{ email: string; refreshToken: string; scope: string }> {
  const client = googleOAuthClient();
  if (!client) throw new Error("client OAuth Google non configuré");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: client.clientId, client_secret: client.clientSecret,
      redirect_uri: gmailRedirectUri(), grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string;
  };
  if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  if (!data.refresh_token) throw new Error("Google n'a pas fourni de jeton de rafraîchissement — réessayez.");
  // id_token reçu directement de Google en HTTPS : la charge utile suffit pour lire l'adresse.
  const payload = data.id_token ? JSON.parse(Buffer.from(data.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string } : {};
  if (!payload.email) throw new Error("adresse Gmail introuvable dans la réponse de Google");
  return { email: payload.email.toLowerCase(), refreshToken: data.refresh_token, scope: data.scope ?? "" };
}

/** Crée ou met à jour le compte d'envoi « Gmail (API) » de cette adresse. */
export async function saveGmailAccount(args: { email: string; refreshToken: string; userId: string }) {
  const existing = await prisma.smtpConfig.findFirst({ where: { host: GMAIL_API_HOST, fromEmail: args.email } });
  if (existing) {
    return prisma.smtpConfig.update({
      where: { id: existing.id },
      data: { passwordEnc: encryptOrNull(args.refreshToken)!, loginEnc: encryptOrNull(args.email)!, isActive: true },
      select: { id: true, label: true },
    });
  }
  const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { name: true } });
  return prisma.smtpConfig.create({
    data: {
      label: `Gmail — ${args.email}`,
      host: GMAIL_API_HOST,
      port: 443,
      loginEnc: encryptOrNull(args.email)!,
      passwordEnc: encryptOrNull(args.refreshToken)!,
      fromEmail: args.email,
      fromName: user?.name ?? null,
      dailyLimit: 200, // Gmail grand public : 500 destinataires / jour maximum
      isActive: true,
    },
    select: { id: true, label: true },
  });
}
