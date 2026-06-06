/**
 * Envoi d'emails transactionnels — réexport depuis @crm/db (partagé web + worker).
 */
export {
  sendTransactionalEmail,
  TransactionalEmailError,
  escapeHtml,
} from "@crm/db";

import { escapeHtml } from "@crm/db";

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
