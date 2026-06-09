import { prisma } from "../packages/db/src/index";

const adminEmail = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").toLowerCase();

export default async function globalSetup(): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: { email: adminEmail, isActive: true },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new Error(
        `E2E setup: utilisateur admin introuvable (${adminEmail}). Lancez « yarn db:seed » puis réessayez.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
