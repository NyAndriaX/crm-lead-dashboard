import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@crm/db";
import { handler, json, created, parseBody, parseQuery, requirePermission, requireRole, requireSession, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  all: z.enum(["true", "false"]).optional(),
  teamId: z.string().optional(),
});

// GET /api/users — liste pour sélecteur (actifs) ou liste complète pour admin (?all=true).
export const GET = handler(async (req) => {
  const session = await requireSession();
  if (!can(session.role, "leads:assign") && !can(session.role, "users:manage")) {
    throw new ApiError(403, "Permission manquante", "forbidden");
  }
  const { all, teamId } = parseQuery(req, querySchema);
  if (all === "true" && !can(session.role, "users:manage")) {
    throw new ApiError(403, "Liste complète réservée à la gestion des utilisateurs", "forbidden");
  }
  const where: Record<string, unknown> = all === "true" ? {} : { isActive: true };
  if (teamId) where.teamId = teamId;
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, role: true, isActive: true,
      lastLoginAt: true, createdAt: true, teamId: true, twoFactorOn: true,
      invitedAt: true,
    },
    orderBy: { name: "asc" },
  });
  return json({ data: users });
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).default("COMMERCIAL"),
  teamId: z.string().nullable().optional(),
});

// POST /api/users — créer un utilisateur. ADMIN uniquement.
export const POST = handler(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseBody(req, createUserSchema);

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "Un utilisateur avec cet email existe déjà", "duplicate_email");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash,
      role: input.role,
      teamId: input.teamId ?? null,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, teamId: true },
  });
  await audit({
    userId: session.sub,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
    diff: { name: input.name, email, role: input.role, teamId: input.teamId ?? null },
  });
  return created({ data: user });
});
