export type { WorkerJobContext, WorkerJobHandler, EnqueueOneOffOptions } from "./types";
export { setWorkerAgenda, getWorkerAgenda } from "./workerAgendaRef";
export { enqueueOneOff } from "./enqueueOneOff";
export { getEnqueueAgenda, enqueueFromWeb } from "./enqueueSingleton";
export { createWorkerAgenda, registerWorkerJobHandlers } from "./workerAgenda";
export type { QueueWorker } from "./workerAgenda";

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
