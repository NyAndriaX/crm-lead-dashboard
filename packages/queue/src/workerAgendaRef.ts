import type { Agenda } from "@hokify/agenda";

let workerAgenda: Agenda | null = null;

export function setWorkerAgenda(agenda: Agenda): void {
  workerAgenda = agenda;
}

export function getWorkerAgenda(): Agenda {
  if (!workerAgenda) {
    throw new Error("Agenda worker non initialisé — appeler setWorkerAgenda avant les handlers.");
  }
  return workerAgenda;
}
