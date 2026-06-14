import { formatPrismaError, prisma } from "@crm/db";
import { setWorkerAgenda } from "./workerAgendaRef";
import type { WorkerJobHandler } from "./types";

const loggedWorkerErrors = new Set<string>();

function logWorkerJobError(scope: string, err: unknown): string {
  const formatted = formatPrismaError(err);
  const key = `${scope}:${formatted.code}`;
  if (!loggedWorkerErrors.has(key)) {
    loggedWorkerErrors.add(key);
    const hint = formatted.hint ? ` — ${formatted.hint}` : "";
    console.error(`[worker] ${scope}: ${formatted.message}${hint}`);
  }
  return formatted.shortMessage;
}

const LOCK_LIFETIME_MS: Record<string, number> = {
  "campaign-send": 35 * 60 * 1000,
  "import-process": 25 * 60 * 1000,
  "imap-sync": 15 * 60 * 1000,
  "sequence-tick": 10 * 60 * 1000,
  "scraping-run": Number(process.env.SCRAPING_JOB_LOCK_MS ?? 4 * 60 * 60 * 1000),
  "scraping-scheduler": 5 * 60 * 1000,
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
};

export interface QueueWorker {
  start(): void;
  stop(): Promise<void>;
  every(interval: string, jobName: string): Promise<void>;
}

const running = new Map<string, number>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let handlers: Record<string, WorkerJobHandler> = {};
let workerId = `worker-${process.pid}-${Date.now()}`;
let stopping = false;

function parseIntervalMs(interval: string): number {
  const match = interval.match(/^(\d+)\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?)$/i);
  if (!match) return 60_000;
  const val = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  if (unit.startsWith("ms") || unit.startsWith("millisecond")) return val;
  if (unit.startsWith("s")) return val * 1000;
  if (unit.startsWith("m")) return val * 60 * 1000;
  if (unit.startsWith("h")) return val * 3600 * 1000;
  return val;
}

async function markImportJobFailed(importJobId: string, reason: string): Promise<void> {
  try {
    await prisma.importJob.updateMany({
      where: { id: importJobId, status: "running" },
      data: { status: "failed", errorReport: reason },
    });
  } catch (e) {
    logWorkerJobError("import-process cleanup", e);
  }
}

async function processJob(jobId: string, type: string, payload: unknown): Promise<void> {
  const handler = handlers[type];
  if (!handler) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: `No handler for job type: ${type}` },
    });
    return;
  }

  try {
    const result = await handler({ payload });
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        result: result !== undefined ? (result as object) : undefined,
        lockedAt: null,
        lockedBy: null,
      },
    });
  } catch (err: unknown) {
    const msg = logWorkerJobError(type, err);
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (job && job.attempts + 1 >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          lastError: msg,
          attempts: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
        },
      });
      if (type === "import-process") {
        const importJobId = (payload as { importJobId?: string })?.importJobId;
        if (importJobId) {
          await markImportJobFailed(importJobId, msg);
        }
      }
    } else {
      const backoffMs = Math.min(30_000 * Math.pow(2, (job?.attempts ?? 0)), 600_000);
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "PENDING",
          lastError: msg,
          attempts: { increment: 1 },
          runAt: new Date(Date.now() + backoffMs),
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
  } finally {
    const count = running.get(type) ?? 1;
    if (count <= 1) running.delete(type);
    else running.set(type, count - 1);
  }
}

async function poll(): Promise<void> {
  if (stopping) return;

  const maxConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
  let totalRunning = 0;
  for (const c of running.values()) totalRunning += c;
  if (totalRunning >= maxConcurrency) return;

  const available = maxConcurrency - totalRunning;

  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: staleThreshold },
    },
    data: {
      status: "PENDING",
      lockedAt: null,
      lockedBy: null,
    },
  });

  const pendingJobs = await prisma.job.findMany({
    where: {
      status: "PENDING",
      runAt: { lte: new Date() },
    },
    orderBy: [{ priority: "desc" }, { runAt: "asc" }],
    take: available,
  });

  for (const job of pendingJobs) {
    const typeMax = CONCURRENCY[job.type] ?? 3;
    const typeRunning = running.get(job.type) ?? 0;
    if (typeRunning >= typeMax) continue;

    const updated = await prisma.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId },
    });
    if (updated.count === 0) continue;

    running.set(job.type, typeRunning + 1);
    processJob(job.id, job.type, job.payload).catch((e) => {
      logWorkerJobError(`job ${job.id} (${job.type})`, e);
    });
  }
}

export async function createWorkerAgenda(): Promise<QueueWorker> {
  const processEvery = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000);

  const worker: QueueWorker = {
    start() {
      stopping = false;
      pollTimer = setInterval(() => {
        poll().catch((e) => logWorkerJobError("queue poll", e));
      }, processEvery);
      poll().catch((e) => logWorkerJobError("queue poll", e));
    },

    async stop() {
      stopping = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      let retries = 0;
      while (running.size > 0 && retries < 30) {
        await new Promise((r) => setTimeout(r, 1000));
        retries++;
      }
    },

    async every(interval: string, jobName: string) {
      const intervalMs = parseIntervalMs(interval);
      const existing = await prisma.job.findFirst({
        where: { type: jobName, status: { in: ["PENDING", "RUNNING"] } },
      });
      if (!existing) {
        await prisma.job.create({
          data: {
            type: jobName,
            payload: { recurring: true, intervalMs },
            status: "PENDING",
            runAt: new Date(),
          },
        });
      }

      const originalHandler = handlers[jobName];
      if (originalHandler) {
        handlers[jobName] = async (ctx) => {
          try {
            return await originalHandler(ctx);
          } catch (err) {
            const short = logWorkerJobError(jobName, err);
            return { skipped: true, error: formatPrismaError(err).code, message: short };
          } finally {
            await prisma.job.create({
              data: {
                type: jobName,
                payload: { recurring: true, intervalMs },
                status: "PENDING",
                runAt: new Date(Date.now() + intervalMs),
              },
            });
          }
        };
      }
    },
  };

  return worker;
}

export function registerWorkerJobHandlers(
  worker: QueueWorker,
  handlerMap: Record<string, WorkerJobHandler>,
): void {
  handlers = { ...handlerMap };
  setWorkerAgenda(worker);
}
