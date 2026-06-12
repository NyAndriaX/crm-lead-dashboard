import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function prismaLogLevels(): ("warn" | "error" | "query")[] {
  const mode = process.env.PRISMA_LOG?.trim().toLowerCase();
  if (mode === "none" || mode === "off") return [];
  if (mode === "query") return ["query", "warn"];
  if (mode === "warn") return ["warn"];
  if (mode === "error") return ["error"];
  // Par défaut : pas de dump Prisma en console (les apps formatent les erreurs).
  return [];
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels(),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
