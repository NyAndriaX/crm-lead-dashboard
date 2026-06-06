/**
 * POST /api/oauth/microsoft/save
 * Chiffre et sauvegarde le refresh_token sur un ImapConfig ou SmtpConfig existant.
 * Body : {
 *   target: "imap" | "smtp",
 *   configId: string,
 *   tenantId, clientId, clientSecret, refreshToken, mailbox
 * }
 */
import { z } from "zod";
import { prisma, encryptToken } from "@crm/db";
import { handler, json, parseBody, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  target: z.enum(["imap", "smtp"]),
  configId: z.string().min(1),
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  mailbox: z.string().email(),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const input = await parseBody(req, bodySchema);

  const oauthData = {
    oauthProvider: "microsoft",
    oauthTenantId: input.tenantId,
    oauthClientId: input.clientId,
    oauthClientSecretEnc: encryptToken(input.clientSecret),
    oauthRefreshTokenEnc: encryptToken(input.refreshToken),
  };

  if (input.target === "imap") {
    await prisma.imapConfig.update({
      where: { id: input.configId },
      data: { ...oauthData, oauthMailbox: input.mailbox },
    });
  } else {
    await prisma.smtpConfig.update({
      where: { id: input.configId },
      data: { ...oauthData, oauthMailSender: input.mailbox },
    });
  }

  return json({ data: { ok: true } });
});
