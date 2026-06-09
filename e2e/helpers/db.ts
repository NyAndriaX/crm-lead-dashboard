import { prisma, recordOpenAiUsage } from "../../packages/db/src/index";
import { cleanupE2eRun } from "./cleanup";

export { prisma, recordOpenAiUsage, cleanupE2eRun as cleanupE2eArtifacts };

export async function getAdminUserId(): Promise<string> {
  const email = (process.env.E2E_ADMIN_EMAIL ?? "admin@crm.local").toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true },
  });
  if (!user) throw new Error(`Admin user not found: ${email}`);
  return user.id;
}
