/**
 * Réinitialisation de mot de passe — demande + confirmation.
 */
import * as crypto from "node:crypto";
import { prisma, sendTransactionalEmail, TransactionalEmailError } from "@crm/db";
import { hashPassword } from "@/lib/auth";
import { ApiError } from "@/lib/api";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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

  try {
    await sendTransactionalEmail({
      to: normalized,
      subject: "Réinitialisation de votre mot de passe — CRM Lead Dashboard",
      html: `<p>Bonjour ${user.name},</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
<p><a href="${resetUrl}">Cliquez ici pour choisir un nouveau mot de passe</a></p>
<p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
      text: `Bonjour ${user.name},\n\nRéinitialisez votre mot de passe : ${resetUrl}\n\nCe lien expire dans 1 heure.`,
    });
  } catch (e) {
    if (e instanceof TransactionalEmailError && e.reason === "no_active_smtp") {
      throw new ApiError(
        503,
        "Aucun compte SMTP actif. Configurez l'envoi dans Paramètres → Emailing.",
        "smtp_unavailable",
      );
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[password-reset] envoi email échoué:", detail);
    throw new ApiError(
      503,
      "Impossible d'envoyer l'email de réinitialisation. Vérifiez la configuration SMTP.",
      "email_send_failed",
    );
  }
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
