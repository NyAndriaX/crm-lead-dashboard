/**
 * Démarrage du processeur de tâches de fond (file MySQL `queue_jobs`, @crm/queue).
 *
 * Par défaut, il tourne DANS le serveur Next.js (apps/web/instrumentation.ts, `RUN_JOBS` ≠ "false").
 * Pour isoler les tâches dans un process dédié plus tard : `RUN_JOBS=false` côté web
 * + `pnpm --filter @crm/jobs start` (src/standalone.ts) — sans changement de code.
 *
 * Fuseau horaire : `WORKER_TIMEZONE` (env) ou document `workerConfig` (id `default`).
 */
import { prisma } from "@crm/db";
import { parseInterval, releaseOrphanedJobs, scheduleRecurring, startQueueWorker, type QueueWorker } from "@crm/queue";
import { handlers } from "./handlers";
import { recoverStaleScrapingJobs } from "./scraping/recover";

// Verrou (durée max d'exécution avant reprise par un autre process) par type de job.
const LOCK_MS: Record<string, number> = {
  "campaign-send": 35 * 60 * 1000,
  "import-process": 25 * 60 * 1000,
  "imap-sync": 15 * 60 * 1000,
  "sequence-tick": 10 * 60 * 1000,
  "scraping-run": Number(process.env.SCRAPING_JOB_LOCK_MS ?? 4 * 60 * 60 * 1000),
  "scraping-scheduler": 5 * 60 * 1000,
  "retention-purge": 30 * 60 * 1000,
  "report-schedule-tick": 10 * 60 * 1000,
};

const CONCURRENCY: Record<string, number> = {
  "campaign-send": 5,
  "import-process": 1,
  noop: 2,
  scoring: 3,
  notification: 5,
  "sequences-stop": 5,
  "imap-sync": 1,
  "sequence-tick": 1,
  "scraping-run": 2,
  "scraping-scheduler": 1,
  "retention-purge": 1,
  "report-schedule-tick": 1,
};

async function resolveTimezone(): Promise<string> {
  const fromEnv = process.env.WORKER_TIMEZONE?.trim();
  if (fromEnv) return fromEnv;
  const row = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  return row?.agendaTimezone?.trim() || "UTC";
}

export async function startJobs(): Promise<QueueWorker> {
  const tz = await resolveTimezone();
  process.env.TZ = tz;

  const recovered = await recoverStaleScrapingJobs();
  if (recovered.missions > 0 || recovered.jobs > 0) {
    console.log(`[jobs] scraping recovery: ${recovered.missions} mission(s), ${recovered.jobs} job(s)`);
  }
  // Autres jobs interrompus par un redémarrage : repris immédiatement (scraping-run exclu, traité ci-dessus).
  const released = await releaseOrphanedJobs(["scraping-run"]);
  if (released > 0) console.log(`[jobs] ${released} job(s) interrompu(s) repris après redémarrage`);

  // Jobs récurrents (R-01 collecte des réponses IMAP, RL-02 tick séquences, planificateur scraping,
  // purge de rétention RGPD, envoi planifié des rapports).
  // `scheduleRecurring` upsert un exemplaire unique par nom — sûr en redémarrage à chaud.
  const recurring = {
    "imap-sync": process.env.IMAP_SYNC_INTERVAL ?? "5 minutes",
    "sequence-tick": process.env.SEQUENCE_TICK_INTERVAL ?? "1 minute",
    "scraping-scheduler": process.env.SCRAPING_SCHEDULER_INTERVAL ?? "1 hour",
    "retention-purge": "1 day",
    // AN-05 : envoi planifié des rapports par email.
    "report-schedule-tick": process.env.REPORT_SCHEDULE_TICK_INTERVAL ?? "15 minutes",
  };
  for (const [name, every] of Object.entries(recurring)) {
    await scheduleRecurring(name, parseInterval(every));
  }

  const worker = startQueueWorker({
    handlers,
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    concurrencyPerJob: CONCURRENCY,
    lockMsPerJob: LOCK_MS,
  });

  console.log(`[jobs] file MySQL queue_jobs — fuseau TZ=${tz}`);
  console.log(`[jobs] handlers: ${Object.keys(handlers).join(", ")}`);
  console.log(`[jobs] recurring: ${Object.entries(recurring).map(([n, e]) => `${n} every ${e}`).join(", ")}`);
  return worker;
}
