/**
 * @crm/queue — file de tâches asynchrones sur MySQL (table `queue_jobs`).
 *
 *  - API web & worker : `enqueue()` (INSERT), `scheduleRecurring()` (upsert).
 *  - Worker uniquement : `startQueueWorker()` (réclamation SKIP LOCKED, verrous, retries).
 */
export type { WorkerJobContext, WorkerJobHandler } from "./types";
export { enqueue, scheduleRecurring, parseInterval, type EnqueueOptions } from "./enqueue";
export { startQueueWorker, type QueueWorker, type QueueWorkerOptions } from "./worker";
export { findOrphanedJobs, releaseOrphanedJobs } from "./orphans";

/** Valide un identifiant IANA de fuseau horaire (ex. Europe/Paris). */
export function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}
