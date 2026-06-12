/**
 * CRM worker — process Node.js standalone (hors Next.js).
 *
 * File de tâches : polling MySQL via Prisma (table `Job`).
 * Fuseau horaire : `AGENDA_TIMEZONE` (env) ou document `workerConfig` (id `default`), appliqué via `process.env.TZ`.
 */
import { formatPrismaError, prisma } from "@crm/db";
import { createWorkerAgenda, registerWorkerJobHandlers } from "@crm/queue";
import { handlers } from "./handlers";
import { recoverStaleScrapingJobs } from "./scraping/recover";

async function resolveAgendaTimezone(): Promise<string> {
  const fromEnv = process.env.AGENDA_TIMEZONE?.trim();
  if (fromEnv) return fromEnv;
  const row = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  return row?.agendaTimezone?.trim() || "UTC";
}

async function main() {
  const agendaTz = await resolveAgendaTimezone();
  process.env.TZ = agendaTz;

  const worker = await createWorkerAgenda();
  registerWorkerJobHandlers(worker, handlers);

  console.log(`[worker] MySQL queue — fuseau TZ=${agendaTz}`);
  console.log(`[worker] handlers: ${Object.keys(handlers).join(", ")}`);

  const imapInterval = process.env.IMAP_SYNC_INTERVAL ?? "5 minutes";
  const sequenceInterval = process.env.SEQUENCE_TICK_INTERVAL ?? "1 minute";
  const scrapingSchedInterval = process.env.SCRAPING_SCHEDULER_INTERVAL ?? "1 hour";
  await worker.every(imapInterval, "imap-sync");
  await worker.every(sequenceInterval, "sequence-tick");
  await worker.every(scrapingSchedInterval, "scraping-scheduler");
  console.log(`[worker] recurring: imap-sync every ${imapInterval}, sequence-tick every ${sequenceInterval}, scraping-scheduler every ${scrapingSchedInterval}`);

  worker.start();

  const recovered = await recoverStaleScrapingJobs();
  if (recovered > 0) {
    console.log(`[worker] scraping recovery: ${recovered} mission(s)`);
  }

  const stop = async (signal: string) => {
    console.log(`[worker] ${signal} — arrêt worker…`);
    try {
      await worker.stop();
    } catch (e) {
      console.error("[worker] erreur worker.stop:", e);
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

main().catch(async (e) => {
  const f = formatPrismaError(e);
  const hint = f.hint ? ` — ${f.hint}` : "";
  console.error(`[worker] arrêt fatal: ${f.message}${hint}`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
