/**
 * POST /api/oauth/microsoft/revoke
 * Supprime le refresh_token OAuth d'un ImapConfig ou SmtpConfig.
 * Body : { target: "imap" | "smtp", configId: string }
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requirePermission, ApiError } from "@/lib/api";
import { strictOwnerWhere } from "@crm/db";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  target: z.enum(["imap", "smtp"]),
  configId: z.string().min(1),
});

export const POST = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const scope = toScope(session);
  const { target, configId } = await parseBody(req, bodySchema);

  const clear = {
    oauthProvider: null,
    oauthTenantId: null,
    oauthClientId: null,
    oauthClientSecretEnc: null,
    oauthRefreshTokenEnc: null,
  };

  if (target === "imap") {
    const row = await prisma.imapConfig.findFirst({
      where: { id: configId, ...strictOwnerWhere(scope.userId) },
    });
    if (!row) throw new ApiError(404, "Configuration IMAP introuvable", "not_found");
    await prisma.imapConfig.update({ where: { id: configId }, data: { ...clear, oauthMailbox: null } });
  } else {
    const row = await prisma.smtpConfig.findFirst({
      where: { id: configId, ...strictOwnerWhere(scope.userId) },
    });
    if (!row) throw new ApiError(404, "Configuration SMTP introuvable", "not_found");
    await prisma.smtpConfig.update({ where: { id: configId }, data: { ...clear, oauthMailSender: null } });
  }

  return json({ data: { ok: true } });
});
