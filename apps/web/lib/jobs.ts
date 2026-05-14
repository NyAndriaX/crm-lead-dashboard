// File de tâches asynchrones — **@hokify/agenda** (MongoDB, collection `crmAgendaJobs` par défaut).
// Le worker (`apps/worker`) consomme les jobs ; l’API web planifie via `enqueueFromWeb`.
import { enqueueFromWeb } from "@crm/queue";

export async function enqueue(
  type: string,
  payload?: unknown,
  opts: { runAt?: Date; priority?: number; maxAttempts?: number } = {},
) {
  void opts.maxAttempts; // conservé pour compat ; la politique de retry est côté Agenda / handler
  await enqueueFromWeb(type, payload ?? {}, { runAt: opts.runAt, priority: opts.priority });
}
