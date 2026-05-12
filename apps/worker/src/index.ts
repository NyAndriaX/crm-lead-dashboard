/**
 * CRM worker — process Node.js standalone (hors Next.js).
 *
 * Pas de Redis : la file de tâches est la collection MongoDB `jobs` (model Job).
 * Le worker fait du polling : prend les jobs PENDING dont `runAt <= now`, les
 * passe en RUNNING (verrou via findOneAndUpdate atomique), exécute le handler
 * enregistré pour `job.type`, puis marque DONE / FAILED (avec backoff exponentiel).
 *
 * Les handlers métier (email-send, imap-sync, import-process, scoring, notification…)
 * seront ajoutés au fil des tickets dans ./handlers.
 */
import { prisma, type Job } from "@crm/db";
import { handlers } from "./handlers";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
const WORKER_ID = `${process.pid}@${process.env.HOSTNAME ?? "local"}`;

let running = true;
let inFlight = 0;

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2 ** attempts * 1000); // 2s, 4s, 8s… plafonné à 5 min
}

/** Réclame atomiquement un job prêt à être traité, ou null. */
async function claimNext(): Promise<Job | null> {
  const now = new Date();
  // findOneAndUpdate atomique côté Mongo via Prisma raw (PENDING & runAt<=now → RUNNING)
  const res = (await prisma.$runCommandRaw({
    findAndModify: "jobs",
    query: { status: "PENDING", runAt: { $lte: now } },
    sort: { priority: -1, runAt: 1 },
    update: { $set: { status: "RUNNING", lockedAt: now, lockedBy: WORKER_ID, updatedAt: now } },
    new: true,
  })) as { value: Record<string, unknown> | null };
  if (!res.value) return null;
  // Recharge via Prisma pour un objet typé propre.
  const id = String((res.value._id as { $oid?: string })?.$oid ?? res.value._id);
  return prisma.job.findUnique({ where: { id } });
}

async function runJob(job: Job): Promise<void> {
  const fn = handlers[job.type];
  try {
    if (!fn) throw new Error(`Aucun handler enregistré pour le type de job "${job.type}"`);
    const result = await fn(job);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "DONE", result: (result ?? null) as object, lockedAt: null, lockedBy: null, lastError: null },
    });
  } catch (err) {
    const attempts = job.attempts + 1;
    const giveUp = attempts >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: giveUp ? "FAILED" : "PENDING",
        attempts,
        runAt: giveUp ? job.runAt : new Date(Date.now() + backoffMs(attempts)),
        lockedAt: null,
        lockedBy: null,
        lastError: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
      },
    });
    console.error(`[worker] job ${job.id} (${job.type}) échec (tentative ${attempts}/${job.maxAttempts})`, err);
  }
}

async function tick() {
  while (running && inFlight < CONCURRENCY) {
    const job = await claimNext();
    if (!job) break;
    inFlight++;
    void runJob(job).finally(() => {
      inFlight--;
    });
  }
}

async function main() {
  console.log(`[worker] démarré — id=${WORKER_ID} poll=${POLL_INTERVAL_MS}ms concurrency=${CONCURRENCY}`);
  console.log(`[worker] handlers: ${Object.keys(handlers).join(", ") || "(aucun pour l'instant)"}`);
  // Boucle de polling.
  while (running) {
    try {
      await tick();
    } catch (e) {
      console.error("[worker] erreur de boucle:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} — arrêt en cours (jobs en vol: ${inFlight})…`);
  running = false;
  // Laisse un court délai aux jobs en cours.
  setTimeout(async () => {
    await prisma.$disconnect();
    process.exit(0);
  }, 2000);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
