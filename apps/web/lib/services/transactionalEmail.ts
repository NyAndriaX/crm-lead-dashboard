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
  const smtp = await prisma.smtpConfig.findFirst({
    where: { isActive: true },
    orderBy: { sentToday: "asc" },
  });
  if (!smtp) {
    throw new TransactionalEmailError(
      "no_active_smtp",
      "Aucune configuration SMTP active n'est disponible. Configurez-en une dans Paramètres → Emailing.",
    );
  }
  const login = decryptOrNull(smtp.loginEnc);
  const pass = decryptOrNull(smtp.passwordEnc);
  if (!login || !pass) {
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

  return { messageId: info.messageId };
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
