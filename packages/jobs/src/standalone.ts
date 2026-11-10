/**
 * Process dédié aux tâches de fond — optionnel (montée en charge).
 * À utiliser avec `RUN_JOBS=false` côté web : `pnpm --filter @crm/jobs start`.
 */
import { prisma } from "@crm/db";
import { startJobs } from "./start";

async function main() {
  const worker = await startJobs();
  const stop = async (signal: string) => {
    console.log(`[jobs] ${signal} — arrêt de la file…`);
    await worker.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

main().catch(async (e) => {
  console.error("[jobs] fatal:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
