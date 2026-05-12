import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { prisma } from "@crm/db";
import { handler, json, created, parseBody, parseQuery, requirePermission, requireRole, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({ all: z.enum(["true", "false"]).optional() });

// GET /api/users — liste pour sélecteur (actifs) ou liste complète pour admin (?all=true).
export const GET = handler(async (req) => {
  await requirePermission("leads:assign");
  const { all } = parseQuery(req, querySchema);
  const users = await prisma.user.findMany({
    where: all === "true" ? {} : { isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return json({ data: users });
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).default("COMMERCIAL"),
});

// POST /api/users — créer un utilisateur. ADMIN uniquement.
export const POST = handler(async (req) => {
  await requireRole("ADMIN");
  const input = await parseBody(req, createUserSchema);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, "Un utilisateur avec cet email existe déjà", "duplicate_email");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash, role: input.role },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  return created({ data: user });
});
