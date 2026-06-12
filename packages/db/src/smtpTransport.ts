/**
 * Transport SMTP partagé — support mot de passe classique et OAuth Microsoft 365.
 */
import { getAccessToken, decryptToken } from "./microsoftOAuth";

export type SmtpAuthRow = {
  loginEnc: Buffer;
  passwordEnc: Buffer;
  oauthProvider: string | null;
  oauthTenantId: string | null;
  oauthClientId: string | null;
  oauthClientSecretEnc: Buffer | null;
  oauthRefreshTokenEnc: Buffer | null;
  oauthMailSender: string | null;
};

/** Construit l'objet `auth` nodemailer (password ou OAuth2). */
export async function buildSmtpNodemailerAuth(
  row: SmtpAuthRow,
  decryptFn: (buf: Buffer) => string | null,
): Promise<
  | { user: string; pass: string }
  | { type: "OAuth2"; user: string; clientId: string; clientSecret: string; refreshToken: string; accessToken: string }
> {
  if (
    row.oauthProvider === "microsoft" &&
    row.oauthTenantId &&
    row.oauthClientId &&
    row.oauthRefreshTokenEnc
  ) {
    const clientSecret = row.oauthClientSecretEnc
      ? decryptToken(row.oauthClientSecretEnc)
      : "";
    const refreshToken = decryptToken(row.oauthRefreshTokenEnc);
    const resp = await getAccessToken(
      {
        tenantId: row.oauthTenantId,
        clientId: row.oauthClientId,
        ...(clientSecret ? { clientSecret } : {}),
      },
      refreshToken,
    );
    const user = row.oauthMailSender ?? decryptFn(row.loginEnc) ?? "";
    if (!user) throw new Error("Adresse OAuth SMTP introuvable");
    return {
      type: "OAuth2",
      user,
      clientId: row.oauthClientId,
      clientSecret,
      refreshToken,
      accessToken: resp.access_token,
    };
  }

  const login = decryptFn(row.loginEnc);
  const pass = decryptFn(row.passwordEnc);
  if (!login || !pass) throw new Error("Identifiants SMTP illisibles");
  return { user: login, pass };
}
