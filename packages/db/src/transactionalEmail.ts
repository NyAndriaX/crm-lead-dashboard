/**
 * Envoi d'emails transactionnels (invitations, notifications, alertes).
 *
 * Réutilise le premier `SmtpConfig` actif en base, sinon le SMTP du .env.
 */
import nodemailer from "nodemailer";
import { prisma } from "./client";
import { decryptOrNull } from "./piiCrypto";

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
    const login = decryptOrNull(smtp.loginEnc);
    const pass = decryptOrNull(smtp.passwordEnc);
    if (!login || !pass) {
      console.error(
        `[email] credentials SMTP illisibles pour config "${smtp.label}" (${smtp.id}) — PII_ENCRYPTION_KEY a-t-elle changé ?`,
      );
      throw new TransactionalEmailError("smtp_credentials_unreadable");
    }
    const fromAddr = smtp.fromEmail ?? login;
    const fromName = smtp.fromName ?? "CRM";
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
