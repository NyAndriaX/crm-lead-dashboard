/**
 * GET    /api/users/:id — détail d'un utilisateur. ADMIN uniquement.
 * PUT    /api/users/:id — mise à jour du rôle / statut / nom / équipe. ADMIN uniquement.
 * DELETE /api/users/:id — désactivation (soft). ADMIN uniquement.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requireRole, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

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
});
