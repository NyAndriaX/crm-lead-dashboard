// File de tâches asynchrones — table MySQL `queue_jobs` (@crm/queue).
// Les tâches sont exécutées par @crm/jobs (démarré dans ce même serveur via instrumentation.ts).
import { enqueue as enqueueJob } from "@crm/queue";

export async function enqueue(
  type: string,
  payload?: unknown,
  opts: { runAt?: Date; priority?: number; maxAttempts?: number } = {},
) {
  await enqueueJob(type, payload ?? {}, opts);
}
