import { Agenda } from "@hokify/agenda";
import { agendaCollectionName } from "./collection";
import { setWorkerAgenda } from "./workerAgendaRef";
import type { WorkerJobHandler } from "./types";

const LOCK_MS: Record<string, number> = {
  "campaign-send": 35 * 60 * 1000,
  "import-process": 25 * 60 * 1000,
};

const CONCURRENCY: Record<string, number> = {
  "campaign-send": 5,
  "import-process": 1,
  noop: 2,
  scoring: 3,
  notification: 5,
  "sequences-stop": 5,
};

export async function createWorkerAgenda(): Promise<Agenda> {
  const uri = process.env.DATABASE_URL?.trim();
  if (!uri) throw new Error("DATABASE_URL manquant pour le worker Agenda.");
  const processEvery = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
  const maxConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
  const agenda = new Agenda({
    name: "crm-worker",
    processEvery,
    maxConcurrency,
    defaultConcurrency: 3,
    defaultLockLifetime: 10 * 60 * 1000,
  });
  await agenda.database(uri, agendaCollectionName());
  await agenda.ready;
  return agenda;
}

export function registerWorkerJobHandlers(agenda: Agenda, handlers: Record<string, WorkerJobHandler>): void {
  setWorkerAgenda(agenda);
  for (const [name, fn] of Object.entries(handlers)) {
    agenda.define(
      name,
      async (job) => {
        await fn({ payload: job.attrs.data });
      },
      {
        concurrency: CONCURRENCY[name] ?? 3,
        lockLifetime: LOCK_MS[name] ?? 10 * 60 * 1000,
      },
    );
  }
}
