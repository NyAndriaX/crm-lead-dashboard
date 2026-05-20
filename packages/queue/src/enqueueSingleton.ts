import { Agenda } from "@hokify/agenda";
import { agendaCollectionName } from "./collection";
import { enqueueOneOff, type EnqueueOneOffOptions } from "./enqueueOneOff";

declare global {
  // eslint-disable-next-line no-var
  var __crm_enqueue_agenda: Agenda | undefined;
  var __crm_enqueue_agenda_init: Promise<Agenda> | undefined;
}

async function connectEnqueueAgenda(): Promise<Agenda> {
  const uri = process.env.DATABASE_URL?.trim();
  if (!uri) throw new Error("DATABASE_URL manquant pour la file Agenda.");
  const agenda = new Agenda({
    name: "crm-web-enqueue",
    processEvery: 60_000,
  });
  await agenda.database(uri, agendaCollectionName());
  await agenda.ready;
  return agenda;
}

/**
 * Agenda partagé pour l’API Next.js (planification uniquement, sans `start()`).
 */
export async function getEnqueueAgenda(): Promise<Agenda> {
  if (globalThis.__crm_enqueue_agenda) return globalThis.__crm_enqueue_agenda;
  globalThis.__crm_enqueue_agenda_init ??= connectEnqueueAgenda().then((a) => {
    globalThis.__crm_enqueue_agenda = a;
    return a;
  });
  return globalThis.__crm_enqueue_agenda_init;
}

export async function enqueueFromWeb(
  type: string,
  payload: unknown,
  opts: EnqueueOneOffOptions & { maxAttempts?: number } = {},
): Promise<void> {
  void opts.maxAttempts; // conservé pour compat signature ; retries gérés par Agenda / handlers
  const agenda = await getEnqueueAgenda();
  await enqueueOneOff(agenda, type, payload, opts);
}
