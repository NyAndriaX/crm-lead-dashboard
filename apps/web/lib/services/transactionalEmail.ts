/**
 * Envoi d'emails transactionnels (invitations, reset 2FA, alertes admin).
 *
 * Stratégie : on réutilise le premier `SmtpConfig` actif en base, classé par
 * `sentToday` croissant pour préserver le warm-up et la rotation déjà en place.
 *
 * Différent de l'envoi campagne : pas de pixel ouverture, pas de List-Unsubscribe,
 * pas de Message-ID custom — c'est un email "système" 1-to-1.
 */
import nodemailer from "nodemailer";
import { prisma } from "@crm/db";
import { decryptOrNull } from "@/lib/crypto";

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
  // 1) SMTP configuré dans l'app (chiffré en base) — prioritaire.
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

  // 2) Fallback : SMTP du .env (bloc « SMTP par défaut »). Permet d'envoyer
  //    invitations / emails système sans config UI préalable.
  const envHost = process.env.SMTP_HOST?.trim();
  const envUser = process.env.SMTP_USER?.trim();
  const envPass = process.env.SMTP_PASS;
  if (envHost && envUser && envPass) {
    const port = Number(process.env.SMTP_PORT ?? 587) || 587;
    const transporter = nodemailer.createTransport({
      host: envHost,
      port,
      secure: port === 465, // 587 → STARTTLS (auto via nodemailer)
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

export function inviteEmailTemplate(args: {
  invitedName: string;
  inviterName: string;
  acceptUrl: string;
  role: string;
}): { subject: string; html: string; text: string } {
  const subject = `Vous êtes invité(e) sur le CRM Lead Dashboard`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f1f1f">
      <h2 style="margin:0 0 16px">Bienvenue ${escapeHtml(args.invitedName)},</h2>
      <p>${escapeHtml(args.inviterName)} vous a invité(e) à rejoindre le CRM Lead Dashboard
      avec le rôle <strong>${escapeHtml(args.role)}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${args.acceptUrl}" style="display:inline-block;padding:12px 24px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Activer mon compte
        </a>
      </p>
      <p style="color:#666;font-size:13px">Ou copiez ce lien dans votre navigateur :<br/>
        <span style="word-break:break-all">${args.acceptUrl}</span>
      </p>
      <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
        Ce lien expire dans 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
      </p>
    </div>
  `;
  const text = `Bienvenue ${args.invitedName},\n\n${args.inviterName} vous a invité(e) à rejoindre le CRM Lead Dashboard avec le rôle ${args.role}.\n\nActivez votre compte ici : ${args.acceptUrl}\n\nCe lien expire dans 7 jours.`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
