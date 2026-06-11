/**
 * Réinitialisation de mot de passe — demande + confirmation.
 */
import * as crypto from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@crm/db";
import { hashPassword } from "@/lib/auth";
import { decryptOrNull } from "@/lib/crypto";
import { ApiError } from "@/lib/api";
import { buildSmtpNodemailerAuth } from "@crm/db";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function pickSmtpTransporter() {
  const smtp = await prisma.smtpConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!smtp) return null;

  const auth = await buildSmtpNodemailerAuth(smtp, decryptOrNull);
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth,
    tls: { rejectUnauthorized: false },
  });
  const fromAddr = smtp.fromEmail ?? smtp.oauthMailSender ?? decryptOrNull(smtp.loginEnc) ?? "no-reply@crm.local";
  const fromName = smtp.fromName ?? "CRM Lead Dashboard";
  return { transporter, from: `"${fromName}" <${fromAddr}>` };
}

/** Crée un token et envoie l'email (ne révèle pas si l'email existe). */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, isActive: true, name: true },
  });
  if (!user || !user.isActive) return;

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const mailer = await pickSmtpTransporter();
  if (!mailer) {
    throw new ApiError(503, "Aucun serveur SMTP configuré pour envoyer l'email de réinitialisation.", "smtp_unavailable");
  }

  await mailer.transporter.sendMail({
    from: mailer.from,
    to: normalized,
    subject: "Réinitialisation de votre mot de passe — CRM Lead Dashboard",
    html: `<p>Bonjour ${user.name},</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
<p><a href="${resetUrl}">Cliquez ici pour choisir un nouveau mot de passe</a></p>
<p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    text: `Bonjour ${user.name},\n\nRéinitialisez votre mot de passe : ${resetUrl}\n\nCe lien expire dans 1 heure.`,
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token.trim());
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) {
    throw new ApiError(400, "Lien invalide ou expiré.", "invalid_token");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
}
