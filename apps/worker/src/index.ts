/**
 * CRM worker — process Node.js standalone (hors Next.js).
 *
 * File de tâches : **@hokify/agenda** sur MongoDB (collection `AGENDA_COLLECTION`, défaut `crmAgendaJobs`).
 * Fuseau horaire : `AGENDA_TIMEZONE` (env) ou document `workerConfig` (id `default`), appliqué via `process.env.TZ`
 * pour les libs Node et les futurs jobs Agenda en expression cron avec `timezone`.
 */
import { prisma } from "@crm/db";
import { createWorkerAgenda, registerWorkerJobHandlers } from "@crm/queue";
import { handlers } from "./handlers";

async function resolveAgendaTimezone(): Promise<string> {
  const fromEnv = process.env.AGENDA_TIMEZONE?.trim();
  if (fromEnv) return fromEnv;
  const row = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  return row?.agendaTimezone?.trim() || "UTC";
}

async function main() {
  const agendaTz = await resolveAgendaTimezone();
  process.env.TZ = agendaTz;

  const agenda = await createWorkerAgenda();
  registerWorkerJobHandlers(agenda, handlers);

  console.log(`[worker] Agenda @hokify — fuseau TZ=${agendaTz}, collection=${process.env.AGENDA_COLLECTION ?? "crmAgendaJobs"}`);
  console.log(`[worker] handlers: ${Object.keys(handlers).join(", ")}`);

  // Jobs récurrents (R-01 collecte des réponses IMAP, RL-02 tick séquences).
  // `every()` upsert atomiquement le job récurrent — sûr en redémarrage à chaud.
  const imapInterval = process.env.IMAP_SYNC_INTERVAL ?? "5 minutes";
  const sequenceInterval = process.env.SEQUENCE_TICK_INTERVAL ?? "1 minute";
  const scrapingSchedInterval = process.env.SCRAPING_SCHEDULER_INTERVAL ?? "1 hour";
  await agenda.every(imapInterval, "imap-sync");
  await agenda.every(sequenceInterval, "sequence-tick");
  await agenda.every(scrapingSchedInterval, "scraping-scheduler");
  console.log(`[worker] recurring: imap-sync every ${imapInterval}, sequence-tick every ${sequenceInterval}, scraping-scheduler every ${scrapingSchedInterval}`);

  await agenda.start();

  const stop = async (signal: string) => {
    console.log(`[worker] ${signal} — arrêt Agenda…`);
    try {
      await agenda.stop();
    } catch (e) {
      console.error("[worker] erreur agenda.stop:", e);
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

main().catch(async (e) => {
  console.error("[worker] fatal:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
