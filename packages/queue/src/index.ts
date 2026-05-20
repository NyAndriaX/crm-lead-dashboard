export type { WorkerJobContext, WorkerJobHandler } from "./types";
export { agendaCollectionName } from "./collection";
export { setWorkerAgenda, getWorkerAgenda } from "./workerAgendaRef";
export { enqueueOneOff, type EnqueueOneOffOptions } from "./enqueueOneOff";
export { getEnqueueAgenda, enqueueFromWeb } from "./enqueueSingleton";
export { createWorkerAgenda, registerWorkerJobHandlers } from "./workerAgenda";

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
