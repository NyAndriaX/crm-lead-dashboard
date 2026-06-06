/**
 * Envoi d'emails transactionnels (invitations, notifications, alertes).
 *
 * Réutilise le premier `SmtpConfig` actif en base, sinon le SMTP du .env.
 */
import nodemailer from "nodemailer";
import { prisma } from "./client";
import { decryptOrNull } from "./piiCrypto";
import { getAccessToken, decryptToken } from "./microsoftOAuth";

export class TransactionalEmailError extends Error {
  constructor(public reason: string, public details?: unknown) {
    super(reason);
  }
}

export async function sendTransactionalEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ messageId: string }> {
  const smtp = await prisma.smtpConfig.findFirst({
    where: { isActive: true },
    orderBy: { sentToday: "asc" },
  });

  if (smtp) {
    const fromAddr = smtp.fromEmail ?? smtp.oauthMailSender ?? "";
    const fromName = smtp.fromName ?? "CRM";

    // OAuth Microsoft 365 (SMTP XOAUTH2)
    if (
      smtp.oauthProvider === "microsoft" &&
      smtp.oauthTenantId &&
      smtp.oauthClientId &&
      smtp.oauthClientSecretEnc &&
      smtp.oauthRefreshTokenEnc
    ) {
      const mailSender = smtp.oauthMailSender ?? fromAddr;
      try {
        const clientSecret = decryptToken(smtp.oauthClientSecretEnc);
        const refreshToken = decryptToken(smtp.oauthRefreshTokenEnc);
        const { access_token } = await getAccessToken(
          { tenantId: smtp.oauthTenantId, clientId: smtp.oauthClientId, clientSecret },
          refreshToken,
        );
        const transporter = nodemailer.createTransport({
          host: "smtp.office365.com",
          port: 587,
          secure: false,
          auth: { type: "OAuth2", user: mailSender, accessToken: access_token },
          tls: { rejectUnauthorized: true },
        });
        const info = await transporter.sendMail({
          from: `"${fromName}" <${mailSender}>`,
          to: args.to,
          subject: args.subject,
          html: args.html,
          text: args.text,
        });
        await prisma.smtpConfig.update({ where: { id: smtp.id }, data: { sentToday: { increment: 1 } } });
        console.info(`[email] envoyé via OAuth Microsoft "${smtp.label}" → ${args.to} (messageId=${info.messageId})`);
        return { messageId: info.messageId };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[email] ÉCHEC envoi OAuth Microsoft "${smtp.label}" → ${args.to} : ${msg}`);
        throw new TransactionalEmailError("smtp_send_failed", msg);
      }
    }

    // SMTP classique (login + mot de passe)
    const login = decryptOrNull(smtp.loginEnc);
    const pass = decryptOrNull(smtp.passwordEnc);
    if (!login || !pass) {
      console.error(
        `[email] credentials SMTP illisibles pour config "${smtp.label}" (${smtp.id}) — PII_ENCRYPTION_KEY a-t-elle changé ?`,
      );
      throw new TransactionalEmailError("smtp_credentials_unreadable");
    }
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: login, pass },
      tls: { rejectUnauthorized: false },
    });
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      await prisma.smtpConfig.update({
        where: { id: smtp.id },
        data: { sentToday: { increment: 1 } },
      });
      console.info(
        `[email] envoyé via SmtpConfig "${smtp.label}" → ${args.to} (messageId=${info.messageId})`,
      );
      return { messageId: info.messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[email] ÉCHEC envoi via SmtpConfig "${smtp.label}" (${smtp.host}:${smtp.port}) → ${args.to} : ${msg}`,
      );
      throw new TransactionalEmailError("smtp_send_failed", msg);
    }
  }

  const envHost = process.env.SMTP_HOST?.trim();
  const envUser = process.env.SMTP_USER?.trim();
  const envPass = process.env.SMTP_PASS?.replace(/\s/g, "");
  if (envHost && envUser && envPass) {
    const port = Number(process.env.SMTP_PORT ?? 587) || 587;
    const transporter = nodemailer.createTransport({
      host: envHost,
      port,
      secure: port === 465,
      auth: { user: envUser, pass: envPass },
      tls: { rejectUnauthorized: false },
    });
    const fromName = process.env.SMTP_FROM_NAME?.trim() || "CRM";
    const fromAddr = process.env.SMTP_FROM_EMAIL?.trim() || envUser;
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      console.info(
        `[email] envoyé via SMTP .env (${envHost}:${port}) → ${args.to} (messageId=${info.messageId})`,
      );
      return { messageId: info.messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[email] ÉCHEC envoi via SMTP .env (${envHost}:${port}, user=${envUser}) → ${args.to} : ${msg}`,
      );
      throw new TransactionalEmailError("smtp_send_failed", msg);
    }
  }

  console.warn(
    "[email] aucun SMTP actif : ni SmtpConfig actif en base, ni SMTP_HOST/SMTP_USER/SMTP_PASS dans le .env — email non envoyé.",
  );
  throw new TransactionalEmailError(
    "no_active_smtp",
    "Aucun SMTP : configurez-en un dans Paramètres → Emailing, ou renseignez SMTP_HOST/SMTP_USER/SMTP_PASS dans le .env.",
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
