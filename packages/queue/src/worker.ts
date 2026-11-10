/**
 * Processeur de la file `queue_jobs` (MySQL 8) — démarré par @crm/jobs (dans le serveur web ou en process dédié).
 *
 * Réclamation atomique d'un job :
 *   SELECT … FOR UPDATE SKIP LOCKED  (dans une transaction)  →  UPDATE status = RUNNING
 * Plusieurs process worker peuvent donc tourner en parallèle sans se marcher dessus.
 *
 * Un job RUNNING dont `lockedUntil` est dépassé (worker tué en plein traitement) redevient
 * éligible. Les jobs récurrents (`repeatEveryMs`) sont replanifiés après chaque exécution,
 * succès ou échec.
 */
import { hostname } from "node:os";
import { Prisma, prisma } from "@crm/db";
import type { WorkerJobHandler } from "./types";

export type QueueWorkerOptions = {
  handlers: Record<string, WorkerJobHandler>;
  /** Fréquence de scan quand la file est vide (défaut 3000 ms). */
  pollIntervalMs?: number;
  /** Nombre max de jobs exécutés simultanément, tous types confondus (défaut 5). */
  concurrency?: number;
  /** Concurrence max par type de job (défaut 3). */
  concurrencyPerJob?: Record<string, number>;
  /** Durée du verrou par type de job (défaut 10 min). */
  lockMsPerJob?: Record<string, number>;
};

export type QueueWorker = { stop: (graceMs?: number) => Promise<void> };

const DEFAULT_LOCK_MS = 10 * 60 * 1000;
const DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function startQueueWorker(opts: QueueWorkerOptions): QueueWorker {
  const workerId = `${hostname()}:${process.pid}`;
  const names = Object.keys(opts.handlers);
  const pollIntervalMs = opts.pollIntervalMs ?? 3000;
  const maxConcurrency = Math.max(1, opts.concurrency ?? 5);
  const running = new Map<string, number>();
  const inFlight = new Set<Promise<void>>();
  let total = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastCleanup = 0;

  const lockMs = (name: string) => opts.lockMsPerJob?.[name] ?? DEFAULT_LOCK_MS;
  const limit = (name: string) => opts.concurrencyPerJob?.[name] ?? 3;

  async function claim(): Promise<{ id: string; name: string; payload: unknown; attempts: number; maxAttempts: number; repeatEveryMs: number | null } | null> {
    const eligible = names.filter((n) => (running.get(n) ?? 0) < limit(n));
    if (eligible.length === 0) return null;
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT id, name FROM queue_jobs
        WHERE name IN (${Prisma.join(eligible)})
          AND ((status = 'PENDING' AND runAt <= ${now})
            OR (status = 'RUNNING' AND lockedUntil < ${now}))
        ORDER BY priority DESC, runAt ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      const row = rows[0];
      if (!row) return null;
      const job = await tx.queueJob.update({
        where: { id: row.id },
        data: {
          status: "RUNNING",
          lockedBy: workerId,
          lockedUntil: new Date(now.getTime() + lockMs(row.name)),
          lastRunAt: now,
          attempts: { increment: 1 },
        },
      });
      return {
        id: job.id,
        name: job.name,
        payload: job.payload,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        repeatEveryMs: job.repeatEveryMs,
      };
    });
  }

  async function execute(job: NonNullable<Awaited<ReturnType<typeof claim>>>): Promise<void> {
    const handler = opts.handlers[job.name]!;
    const finishedAt = () => new Date();
    try {
      const result = await handler({ payload: job.payload });
      if (job.repeatEveryMs) {
        await prisma.queueJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING", runAt: new Date(Date.now() + job.repeatEveryMs), attempts: 0,
            lockedBy: null, lockedUntil: null, lastFinishedAt: finishedAt(), lastError: null,
          },
        });
      } else {
        await prisma.queueJob.update({
          where: { id: job.id },
          data: {
            status: "DONE", lockedBy: null, lockedUntil: null, lastFinishedAt: finishedAt(), lastError: null,
            result: result === undefined ? Prisma.DbNull : (JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue),
          },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
      console.error(`[queue] job ${job.name} (${job.id}) KO :`, e instanceof Error ? e.message : e);
      const retry = !job.repeatEveryMs && job.attempts < job.maxAttempts;
      await prisma.queueJob.update({
        where: { id: job.id },
        data: {
          status: job.repeatEveryMs || retry ? "PENDING" : "FAILED",
          // Backoff exponentiel (30 s, 60 s, 120 s…) pour les retries ; intervalle normal si récurrent.
          runAt: job.repeatEveryMs
            ? new Date(Date.now() + job.repeatEveryMs)
            : new Date(Date.now() + 30_000 * 2 ** Math.max(0, job.attempts - 1)),
          attempts: job.repeatEveryMs ? 0 : undefined,
          lockedBy: null, lockedUntil: null, lastFinishedAt: finishedAt(),
          lastError: message.slice(0, 60_000),
        },
      }).catch((err) => console.error("[queue] impossible d'enregistrer l'échec :", err));
    }
  }

  async function cleanup(): Promise<void> {
    if (Date.now() - lastCleanup < 60 * 60 * 1000) return;
    lastCleanup = Date.now();
    const { count } = await prisma.queueJob.deleteMany({
      where: { status: "DONE", repeatEveryMs: null, lastFinishedAt: { lt: new Date(Date.now() - DONE_RETENTION_MS) } },
    });
    if (count > 0) console.log(`[queue] purge : ${count} job(s) DONE de plus de 7 jours`);
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await cleanup();
      while (!stopped && total < maxConcurrency) {
        const job = await claim();
        if (!job) break;
        total++;
        running.set(job.name, (running.get(job.name) ?? 0) + 1);
        const p = execute(job).finally(() => {
          total--;
          running.set(job.name, (running.get(job.name) ?? 1) - 1);
          inFlight.delete(p);
          // Un emplacement s'est libéré : on tente immédiatement le job suivant.
          if (!stopped) void tick();
        });
        inFlight.add(p);
      }
    } catch (e) {
      console.error("[queue] erreur de scan :", e instanceof Error ? e.message : e);
    } finally {
      if (!stopped) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void tick(), pollIntervalMs);
      }
    }
  }

  void tick();

  return {
    async stop(graceMs = 30_000) {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Laisse les jobs en cours se terminer ; au-delà, leur verrou expirera et ils seront repris.
      await Promise.race([Promise.allSettled([...inFlight]), new Promise((r) => setTimeout(r, graceMs))]);
    },
  };
}
