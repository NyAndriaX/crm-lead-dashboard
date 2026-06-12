/**
 * POST /api/oauth/microsoft/save
 * Crée ou met à jour un compte IMAP/SMTP avec OAuth Microsoft 365.
 *
 * Modes :
 * - outlook (défaut) : crée IMAP + SMTP Outlook si absents, puis applique OAuth aux deux
 * - imap / smtp : lie OAuth à un compte existant (configId requis)
 */
import { z } from "zod";
import { prisma, encryptToken } from "@crm/db";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { toScope } from "@/lib/scope";
import { createImapConfig } from "@/lib/services/imap";
import { createSmtpConfig } from "@/lib/services/smtp";

export const dynamic = "force-dynamic";

const OUTLOOK_IMAP = { host: "outlook.office365.com", port: 993 };
const OUTLOOK_SMTP = { host: "smtp.office365.com", port: 587 };
const OAUTH_PLACEHOLDER = "oauth";

const bodySchema = z
  .object({
    mode: z.enum(["outlook", "imap", "smtp"]).optional(),
    target: z.enum(["imap", "smtp"]).optional(),
    configId: z.string().optional(),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().trim().optional(),
    refreshToken: z.string().min(1),
    mailbox: z.string().email(),
  })
  .superRefine((val, ctx) => {
    const mode = val.mode ?? val.target ?? "outlook";
    if ((mode === "imap" || mode === "smtp") && !val.configId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "configId requis pour lier un compte existant",
        path: ["configId"],
      });
    }
  });

export const POST = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const scope = toScope(session);
  const input = await parseBody(req, bodySchema);

  const mode = input.mode ?? input.target ?? "outlook";

  const secret = (input.clientSecret ?? "").trim();
  const oauthData = {
    oauthProvider: "microsoft" as const,
    oauthTenantId: input.tenantId,
    oauthClientId: input.clientId,
    oauthClientSecretEnc: secret ? encryptToken(secret) : null,
    oauthRefreshTokenEnc: encryptToken(input.refreshToken),
  };

  const label = input.mailbox.split("@")[0] ?? input.mailbox;

  if (mode === "outlook") {
    let imap = await prisma.imapConfig.findFirst({
      where: { ownerUserId: scope.userId, oauthMailbox: input.mailbox },
      select: { id: true },
    });
    if (!imap) {
      const created = await createImapConfig(
        {
          label: `Outlook — ${label}`,
          ...OUTLOOK_IMAP,
          login: input.mailbox,
          password: OAUTH_PLACEHOLDER,
        },
        scope,
      );
      imap = { id: created.id };
    }

    let smtp = await prisma.smtpConfig.findFirst({
      where: { ownerUserId: scope.userId, oauthMailSender: input.mailbox },
      select: { id: true },
    });
    if (!smtp) {
      const created = await createSmtpConfig(
        {
          label: `Outlook — ${label}`,
          ...OUTLOOK_SMTP,
          login: input.mailbox,
          password: OAUTH_PLACEHOLDER,
          fromEmail: input.mailbox,
          fromName: label,
        },
        scope,
      );
      smtp = { id: created.id };
    }

    await prisma.$transaction([
      prisma.imapConfig.update({
        where: { id: imap.id },
        data: { ...oauthData, oauthMailbox: input.mailbox },
      }),
      prisma.smtpConfig.update({
        where: { id: smtp.id },
        data: { ...oauthData, oauthMailSender: input.mailbox },
      }),
    ]);

    return json({ data: { ok: true, imapConfigId: imap.id, smtpConfigId: smtp.id } });
  }

  if (mode === "imap") {
    const existing = await prisma.imapConfig.findFirst({
      where: { id: input.configId!, ownerUserId: scope.userId },
    });
    if (!existing) throw new ApiError(404, "Compte IMAP introuvable", "not_found");
    await prisma.imapConfig.update({
      where: { id: input.configId! },
      data: { ...oauthData, oauthMailbox: input.mailbox },
    });
  } else {
    const existing = await prisma.smtpConfig.findFirst({
      where: { id: input.configId!, ownerUserId: scope.userId },
    });
    if (!existing) throw new ApiError(404, "Compte SMTP introuvable", "not_found");
    await prisma.smtpConfig.update({
      where: { id: input.configId! },
      data: { ...oauthData, oauthMailSender: input.mailbox },
    });
  }

  return json({ data: { ok: true } });
});
