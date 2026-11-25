/**
 * Moyen d'envoi d'un compte d'envoi (table `smtpConfig`), partagé par l'application web et les tâches de fond.
 *
 *  - Compte SMTP classique : transport SMTP nodemailer (inchangé).
 *  - Compte « Gmail (API) » (host = GMAIL_API_HOST) : le message est composé par nodemailer puis envoyé
 *    par l'API Gmail en HTTPS (users.messages.send). Utile quand l'hébergeur bloque les ports SMTP
 *    sortants (ex. Render gratuit). `login` = adresse Gmail, `pass` = jeton de rafraîchissement OAuth
 *    (obtenu par « Connecter un compte Gmail », stocké chiffré comme un mot de passe).
 *    Client OAuth : GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.
 *
 * L'appelant garde la même API : `transporter.sendMail({...})` et `transporter.verify()`.
 */
import nodemailer, { type Transporter } from "nodemailer";

export const GMAIL_API_HOST = "gmail-api";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export function isGmailApiAccount(host: string | null | undefined): boolean {
  return (host ?? "").trim().toLowerCase() === GMAIL_API_HOST;
}

export type SendingAccount = { host: string; port: number; login: string; pass: string };

export function googleOAuthClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Erreur lisible pour l'utilisateur (affichée comme raison d'échec d'envoi). */
export class GmailApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "GmailApiError";
  }
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const client = googleOAuthClient();
  if (!client) {
    throw new GmailApiError("client OAuth Google non configuré (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).", "oauth_client_missing");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId, client_secret: client.clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      throw new GmailApiError("autorisation Gmail expirée ou révoquée — reconnectez le compte (Configuration › Emailing).", "invalid_grant");
    }
    throw new GmailApiError(`jeton Google refusé (${data.error ?? res.status}${data.error_description ? ` : ${data.error_description}` : ""}).`, "token_error");
  }
  tokenCache.set(refreshToken, { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function gmailSend(refreshToken: string, raw: Buffer): Promise<{ id?: string; threadId?: string }> {
  const token = await accessToken(refreshToken);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(raw) }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string; status?: string } };
  if (!res.ok) {
    if (res.status === 401) tokenCache.delete(refreshToken);
    throw new GmailApiError(`envoi refusé par Gmail (${res.status}${data.error?.message ? ` : ${data.error.message}` : ""}).`, "send_error");
  }
  return data;
}

/** Transport nodemailer personnalisé : compose le message (MIME) puis l'envoie par l'API Gmail. */
function gmailApiTransport(login: string, refreshToken: string) {
  return {
    name: "gmail-api",
    version: "1.0.0",
    send(mail: { message: { build(cb: (err: Error | null, msg: Buffer) => void): void; messageId(): string; getEnvelope(): { from: string | false; to: string[] } } }, callback: (err: Error | null, info?: unknown) => void) {
      mail.message.build((err, raw) => {
        if (err) return callback(err);
        gmailSend(refreshToken, raw)
          .then((r) => {
            const envelope = mail.message.getEnvelope();
            callback(null, { envelope, messageId: mail.message.messageId(), accepted: envelope.to, rejected: [], response: `gmail-api ${r.id ?? ""}`.trim(), gmailId: r.id, from: login });
          })
          .catch((e: unknown) => callback(e instanceof Error ? e : new Error(String(e))));
      });
    },
    // nodemailer appelle verify() avec ou sans rappel selon la version : on gère les deux.
    verify(callback?: (err: Error | null, ok?: true) => void): Promise<true> | void {
      const p = accessToken(refreshToken).then(() => true as const);
      if (!callback) return p;
      p.then(() => callback(null, true)).catch((e: unknown) => callback(e instanceof Error ? e : new Error(String(e))));
    },
  };
}

/** Transport d'envoi pour un compte (SMTP ou Gmail API), même interface nodemailer dans les deux cas. */
export function createAccountTransport(acc: SendingAccount, smtpExtra: Record<string, unknown> = {}): Transporter {
  if (isGmailApiAccount(acc.host)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return nodemailer.createTransport(gmailApiTransport(acc.login, acc.pass) as any);
  }
  return nodemailer.createTransport({
    host: acc.host,
    port: acc.port,
    secure: acc.port === 465,
    auth: { user: acc.login, pass: acc.pass },
    tls: { rejectUnauthorized: false },
    ...smtpExtra,
  });
}
