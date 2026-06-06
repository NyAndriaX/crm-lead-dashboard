/**
 * Notifications utilisateur — in-app + email (renforcement).
 *
 * Chaque événement crée une entrée `Notification` en base et tente un email
 * transactionnel au destinataire (échec SMTP non bloquant).
 */
import { prisma } from "./client";
import { escapeHtml, sendTransactionalEmail } from "./transactionalEmail";

export type NotifyUserInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Désactive l'email (ex. seed / tests). */
  skipEmail?: boolean;
};

export type NotifyUserResult = {
  id: string;
  emailSent: boolean;
};

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function notificationEmailTemplate(args: {
  userName: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
}): { subject: string; html: string; text: string } {
  const subject = args.title;
  const bodyBlock = args.body
    ? `<p style="margin:0 0 16px;color:#444">${escapeHtml(args.body)}</p>`
    : "";
  const actionBlock = args.actionUrl
    ? `<p style="margin:24px 0">
        <a href="${args.actionUrl}" style="display:inline-block;padding:12px 24px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
          Ouvrir dans le CRM
        </a>
      </p>
      <p style="color:#666;font-size:13px">Ou copiez ce lien :<br/>
        <span style="word-break:break-all">${escapeHtml(args.actionUrl)}</span>
      </p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f1f1f">
      <p style="margin:0 0 8px;color:#888;font-size:13px">Bonjour ${escapeHtml(args.userName)},</p>
      <h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(args.title)}</h2>
      ${bodyBlock}
      ${actionBlock}
      <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
        Vous recevez cet email en complément de la notification dans le CRM Lead Dashboard.
      </p>
    </div>
  `;
  const textParts = [
    `Bonjour ${args.userName},`,
    "",
    args.title,
    args.body ?? "",
    args.actionUrl ? `\nOuvrir : ${args.actionUrl}` : "",
    "",
    "— Notification CRM Lead Dashboard",
  ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""));
  return { subject, html, text: textParts.join("\n") };
}

/** Crée la notification in-app et envoie un email de renfort au destinataire. */
export async function notifyUser(input: NotifyUserInput): Promise<NotifyUserResult> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  });

  if (input.skipEmail) return { id: row.id, emailSent: false };

  let emailSent = false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, isActive: true },
    });
    if (!user?.isActive || !user.email) {
      return { id: row.id, emailSent: false };
    }

    const actionUrl = input.link ? `${appBaseUrl()}${input.link.startsWith("/") ? input.link : `/${input.link}`}` : null;
    const tpl = notificationEmailTemplate({
      userName: user.name,
      title: input.title,
      body: input.body ?? null,
      actionUrl,
    });
    await sendTransactionalEmail({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });
    emailSent = true;
  } catch (e) {
    console.warn(
      `[notify] email non envoyé userId=${input.userId} type=${input.type}:`,
      e instanceof Error ? e.message : e,
    );
  }

  return { id: row.id, emailSent };
}
