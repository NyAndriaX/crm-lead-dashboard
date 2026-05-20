/**
 * POST /api/users/invite — invite par email (U-01).
 *
 * - Crée un User en pending (passwordHash temporaire aléatoire, inviteToken + invitedAt).
 * - Envoie un email d'invitation contenant le lien `/accept-invite?token=...`.
 * - Si l'utilisateur existe déjà (et qu'il a invitedAt non null), on régénère son token.
 *
 * L'acceptation se fait via POST /api/users/accept-invite (token → mot de passe).
 */
import * as crypto from "node:crypto";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@crm/db";
import { ApiError, handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { sendTransactionalEmail, inviteEmailTemplate, TransactionalEmailError } from "@/lib/services/transactionalEmail";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).default("COMMERCIAL"),
  teamId: z.string().nullable().optional(),
});

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export const POST = handler(async (req) => {
  const session = await requirePermission("users:manage");
  const input = await parseBody(req, inviteSchema);
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.invitedAt == null && existing.isActive) {
    throw new ApiError(409, "Un utilisateur actif avec cet email existe déjà", "duplicate_email");
  }

  const token = generateToken();
  const tempPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12);

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          role: input.role,
          teamId: input.teamId ?? null,
          inviteToken: token,
          invitedAt: new Date(),
          isActive: false,
        },
        select: { id: true, name: true, email: true, role: true, invitedAt: true },
      })
    : await prisma.user.create({
        data: {
          name: input.name,
          email,
          passwordHash: tempPasswordHash,
          role: input.role,
          teamId: input.teamId ?? null,
          inviteToken: token,
          invitedAt: new Date(),
          isActive: false,
        },
        select: { id: true, name: true, email: true, role: true, invitedAt: true },
      });

  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;

  const emailContent = inviteEmailTemplate({
    invitedName: input.name,
    inviterName: session.name,
    acceptUrl,
    role: input.role,
  });

  let emailSent = false;
  let emailError: string | null = null;
  try {
    await sendTransactionalEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
    emailSent = true;
  } catch (e) {
    if (e instanceof TransactionalEmailError) {
      if (e.reason === "no_active_smtp") {
        emailError = "Aucun SMTP actif n'est configuré — l'utilisateur a été créé mais l'email d'invitation n'a pas pu être envoyé. Configurez un SMTP dans Paramètres → Emailing puis relancez l'invitation.";
      } else if (e.reason === "smtp_send_failed") {
        emailError = `Échec de l'envoi par le serveur SMTP : ${typeof e.details === "string" ? e.details : "erreur inconnue"}. L'utilisateur a été créé ; relancez l'invitation après correction.`;
      } else if (e.reason === "smtp_credentials_unreadable") {
        emailError = "Les identifiants SMTP enregistrés sont illisibles (clé de chiffrement modifiée ?). Reconfigurez le compte SMTP dans Paramètres → Emailing.";
      } else {
        emailError = `Échec envoi email : ${e.reason}`;
      }
    } else {
      emailError = `Échec envoi email : ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  await audit({
    userId: session.sub,
    action: "user.invite",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
    diff: { name: input.name, email, role: input.role, emailSent },
  });

  return json({
    data: user,
    email: {
      sent: emailSent,
      error: emailError,
      // En dev : on retourne le lien pour tester sans SMTP configuré.
      ...(process.env.NODE_ENV !== "production" ? { acceptUrl } : {}),
    },
  });
});
