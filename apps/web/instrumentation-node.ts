/**
 * Démarrage des tâches de fond (runtime Node uniquement — voir instrumentation.ts).
 *
 * `RUN_JOBS=false` désactive ce démarrage (tâches exécutées par un process dédié :
 * `pnpm jobs`). La file MySQL (SKIP LOCKED) garantit qu'un job n'est jamais exécuté
 * deux fois, même avec plusieurs instances.
 */
import { startJobs } from "@crm/jobs";

const g = globalThis as unknown as { __crmJobsStarted?: boolean };

export async function startBackgroundJobs(): Promise<void> {
  if ((process.env.RUN_JOBS ?? "true").toLowerCase() === "false") return;
  if (g.__crmJobsStarted) return; // garde contre un double démarrage (hot reload en dev)
  g.__crmJobsStarted = true;
  const worker = await startJobs();
  process.once("SIGTERM", () => void worker.stop(10_000));
}
