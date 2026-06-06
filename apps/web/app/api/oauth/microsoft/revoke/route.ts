/**
 * POST /api/oauth/microsoft/revoke
 * Supprime le refresh_token OAuth d'un ImapConfig ou SmtpConfig.
 * Body : { target: "imap" | "smtp", configId: string }
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  target: z.enum(["imap", "smtp"]),
  configId: z.string().min(1),
});

export const POST = handler(async (req) => {
  await requirePermission("settings:manage");
  const { target, configId } = await parseBody(req, bodySchema);

  const clear = {
    oauthProvider: null,
    oauthTenantId: null,
    oauthClientId: null,
    oauthClientSecretEnc: null,
    oauthRefreshTokenEnc: null,
  };

  if (target === "imap") {
    await prisma.imapConfig.update({ where: { id: configId }, data: { ...clear, oauthMailbox: null } });
  } else {
    await prisma.smtpConfig.update({ where: { id: configId }, data: { ...clear, oauthMailSender: null } });
  }

  return json({ data: { ok: true } });
});
