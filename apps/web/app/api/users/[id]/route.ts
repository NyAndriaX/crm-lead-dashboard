/**
 * GET    /api/users/:id — détail d'un utilisateur. ADMIN uniquement.
 * PUT    /api/users/:id — mise à jour du rôle / statut / nom / équipe. ADMIN uniquement.
 * DELETE /api/users/:id            — désactivation (soft, réversible). ADMIN uniquement.
 * DELETE /api/users/:id?hard=true  — suppression DÉFINITIVE + nettoyage des données liées.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, parseQuery, requireRole, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const deleteQuerySchema = z.object({
  hard: z.enum(["true", "false"]).optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).optional(),
  isActive: z.boolean().optional(),
  teamId: z.string().nullable().optional(),
});

export const GET = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireRole("ADMIN");
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true, isActive: true,
      lastLoginAt: true, createdAt: true, teamId: true,
      twoFactorOn: true, invitedAt: true,
    },
  });
  if (!user) throw new ApiError(404, "Utilisateur introuvable", "not_found");
  return json({ data: user });
});

export const PUT = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole("ADMIN");

  const input = await parseBody(req, updateUserSchema);

  if (session.sub === id) {
    // Auto-modification : on autorise le changement de nom et d'équipe,
    // mais on bloque le changement de rôle/statut (anti-self-lockout).
    if (input.role !== undefined || input.isActive === false) {
      throw new ApiError(400, "Vous ne pouvez pas modifier votre propre rôle ou désactiver votre compte", "self_edit");
    }
  }

  const before = await prisma.user.findUnique({
    where: { id },
    select: { name: true, role: true, isActive: true, teamId: true },
  });
  if (!before) throw new ApiError(404, "Utilisateur introuvable", "not_found");

  const user = await prisma.user.update({
    where: { id },
    data: { ...input },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, teamId: true },
  });

  // Si on désactive le compte, on force la déconnexion en bumpant tokenVersion.
  if (input.isActive === false && before.isActive === true) {
    await prisma.user.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  await audit({
    userId: session.sub,
    action: "user.update",
    entityType: "User",
    entityId: id,
    ip: clientIp(req),
    diff: { before, after: { ...before, ...input } },
  });
  return json({ data: user });
});

export const DELETE = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole("ADMIN");
  const { hard } = parseQuery(req, deleteQuerySchema);

  // Cas par défaut : désactivation (soft). Réversible, conserve l'historique.
  if (hard !== "true") {
    if (session.sub === id) {
      throw new ApiError(400, "Vous ne pouvez pas désactiver votre propre compte", "self_edit");
    }
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false, tokenVersion: { increment: 1 } },
      select: { id: true, name: true, isActive: true },
    });
    await audit({
      userId: session.sub,
      action: "user.deactivate",
      entityType: "User",
      entityId: id,
      ip: clientIp(req),
    });
    return json({ data: user });
  }

  // Cas ?hard=true : suppression DÉFINITIVE. Irréversible.
  if (session.sub === id) {
    throw new ApiError(400, "Vous ne pouvez pas supprimer votre propre compte", "self_delete");
  }
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) throw new ApiError(404, "Utilisateur introuvable", "not_found");

  // Un compte ADMIN ne peut jamais être supprimé. Pour le retirer, il faut
  // d'abord le rétrograder (changer son rôle) puis le supprimer.
  if (target.role === "ADMIN") {
    throw new ApiError(
      400,
      "Un administrateur ne peut pas être supprimé. Changez d'abord son rôle, puis supprimez le compte.",
      "admin_protected",
    );
  }

  // Nettoyage des données liées avant la suppression (Mongo n'a pas de cascade).
  //  - Leads : on les remet dans le pool (assignedToId → null) plutôt que de les perdre.
  //  - TemplateBlock : contenu partagé conservé, on enlève juste l'auteur.
  //  - LeadView / Notification : données perso éphémères → supprimées.
  //  - ImportJob / AuditLog / LeadHistory : conservés (orphelins tolérés par l'app).
  const [unassignedLeads, , clearedViews, clearedNotifs] = await prisma.$transaction([
    prisma.lead.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
    prisma.templateBlock.updateMany({ where: { createdById: id }, data: { createdById: null } }),
    prisma.leadView.deleteMany({ where: { userId: id } }),
    prisma.notification.deleteMany({ where: { userId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  await audit({
    userId: session.sub,
    action: "user.delete",
    entityType: "User",
    entityId: id,
    ip: clientIp(req),
    diff: {
      deleted: { name: target.name, email: target.email, role: target.role },
      unassignedLeads: unassignedLeads.count,
      clearedViews: clearedViews.count,
      clearedNotifications: clearedNotifs.count,
    },
  });

  return json({
    data: {
      id: target.id,
      name: target.name,
      deleted: true,
      unassignedLeads: unassignedLeads.count,
    },
  });
});
