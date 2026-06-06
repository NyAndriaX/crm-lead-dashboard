/**
 * Service OAuth Microsoft 365 — partagé web + worker.
 *
 * Flux :
 *  1. Device code (setup UI) : l'utilisateur s'authentifie une fois dans son navigateur.
 *  2. refresh_token (chiffré AES-256) stocké en base sur ImapConfig / SmtpConfig.
 *  3. À chaque sync / envoi : getAccessToken() échange le refresh token → access token (1 h).
 *
 * Permissions requises (Delegated, accordées par l'admin DATALIA) :
 *   SMTP.Send · IMAP.AccessAsUser.All · offline_access · User.Read
 */
import https from "node:https";
import { encrypt, decrypt } from "./piiCrypto";

export const MS_OAUTH_SCOPES = [
  "offline_access",
  "https://outlook.office365.com/SMTP.Send",
  "https://outlook.office365.com/IMAP.AccessAsUser.All",
  "User.Read",
].join(" ");

export type MsOAuthConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type MsTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postHttps(hostname: string, path: string, body: string): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        path,
        method: "POST",
        family: 4,
        timeout: 20_000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: { raw: text } });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("MS OAuth request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Token exchange ────────────────────────────────────────────────────────────

/** Échange un refresh_token → access_token (et potentiellement un nouveau refresh_token). */
export async function getAccessToken(
  cfg: MsOAuthConfig,
  refreshToken: string,
): Promise<MsTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    scope: MS_OAUTH_SCOPES,
  }).toString();

  const { status, json } = await postHttps(
    "login.microsoftonline.com",
    `/${cfg.tenantId}/oauth2/v2.0/token`,
    body,
  );

  const r = json as Record<string, unknown>;
  if (status !== 200 || !r.access_token) {
    throw new Error(
      `MS OAuth token exchange échoué (${status}): ${r.error_description ?? r.error ?? JSON.stringify(r)}`,
    );
  }
  return r as unknown as MsTokenResponse;
}

// ─── Device code flow ──────────────────────────────────────────────────────────

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
};

/** Lance le device code flow — renvoie le code à afficher à l'utilisateur. */
export async function startDeviceCodeFlow(cfg: MsOAuthConfig): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    scope: MS_OAUTH_SCOPES,
  }).toString();

  const { status, json } = await postHttps(
    "login.microsoftonline.com",
    `/${cfg.tenantId}/oauth2/v2.0/devicecode`,
    body,
  );

  const r = json as Record<string, unknown>;
  if (status !== 200 || !r.device_code) {
    throw new Error(
      `Device code request échoué (${status}): ${r.error_description ?? r.error ?? JSON.stringify(r)}`,
    );
  }
  return r as unknown as DeviceCodeResponse;
}

/** Sonde le token endpoint jusqu'à consentement ou timeout. */
export async function pollDeviceCodeToken(
  cfg: MsOAuthConfig,
  deviceCode: string,
  intervalSec = 5,
  maxWaitMs = 120_000,
): Promise<MsTokenResponse> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: cfg.clientId,
      device_code: deviceCode,
    }).toString();

    const { status, json } = await postHttps(
      "login.microsoftonline.com",
      `/${cfg.tenantId}/oauth2/v2.0/token`,
      body,
    );

    const r = json as Record<string, unknown>;
    if (r.error === "authorization_pending") continue;
    if (r.error === "slow_down") {
      intervalSec = Math.min(intervalSec + 5, 30);
      continue;
    }
    if (status === 200 && r.access_token) return r as unknown as MsTokenResponse;
    throw new Error(
      `Device code poll échoué (${status}): ${r.error_description ?? r.error ?? JSON.stringify(r)}`,
    );
  }
  throw new Error("Délai device code dépassé (120 s).");
}

// ─── Chiffrement helpers ───────────────────────────────────────────────────────

export function encryptToken(token: string): Buffer {
  return encrypt(token);
}

export function decryptToken(buf: Buffer | Uint8Array): string {
  return decrypt(Buffer.from(buf));
}
