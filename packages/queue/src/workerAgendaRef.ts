import type { QueueWorker } from "./workerAgenda";

let workerRef: QueueWorker | null = null;

export function setWorkerAgenda(worker: QueueWorker): void {
  workerRef = worker;
}

export function getWorkerAgenda(): QueueWorker {
  if (!workerRef) {
    throw new Error("Queue worker non initialisé — appeler setWorkerAgenda avant les handlers.");
  }
  return workerRef;
}
