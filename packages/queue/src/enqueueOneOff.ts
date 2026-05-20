import type { Agenda } from "@hokify/agenda";

export type EnqueueOneOffOptions = {
  runAt?: Date;
  /** Valeur Agenda (souvent chaîne : "highest", "high", "normal", "low", "lowest" ou nombre). */
  priority?: number | string;
};

/**
 * Crée un job unique planifié (sans démarrer le processeur Agenda — usage côté Next.js ou worker).
 */
export async function enqueueOneOff(
  agenda: Agenda,
  name: string,
  data: unknown,
  opts: EnqueueOneOffOptions = {},
): Promise<void> {
  await agenda.ready;
  const job = agenda.create(name, (data ?? {}) as object);
  job.schedule(opts.runAt ?? new Date());
  if (opts.priority !== undefined) {
    // parsePriority gère les nombres ; les libellés Agenda : lowest | low | normal | high | highest
    job.priority(opts.priority as never);
  }
  await job.save();
}
