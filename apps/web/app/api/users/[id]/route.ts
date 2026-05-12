/**
 * GET    /api/users/:id — détail d'un utilisateur. ADMIN uniquement.
 * PUT    /api/users/:id — mise à jour du rôle / statut / nom. ADMIN uniquement.
 * DELETE /api/users/:id — désactivation (soft). ADMIN uniquement.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requireRole, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).optional(),
  isActive: z.boolean().optional(),
});

export const GET = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireRole("ADMIN");
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, teamId: true },
  });
  if (!user) throw new ApiError(404, "Utilisateur introuvable", "not_found");
  return json({ data: user });
});

export const PUT = handler(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole("ADMIN");
  if (session.sub === id) throw new ApiError(400, "Vous ne pouvez pas modifier votre propre rôle/statut", "self_edit");

  const input = await parseBody(req, updateUserSchema);
  const user = await prisma.user.update({
    where: { id },
    data: { ...input },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  return json({ data: user });
});

export const DELETE = handler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await requireRole("ADMIN");
  if (session.sub === id) throw new ApiError(400, "Vous ne pouvez pas désactiver votre propre compte", "self_edit");
  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, isActive: true },
  });
  return json({ data: user });
});
