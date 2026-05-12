// File de tâches asynchrones (collection `jobs`, consommée par apps/worker).
// Remplace BullMQ/Redis : on insère simplement un document Job en PENDING.
import { prisma } from "@crm/db";

export async function enqueue(
  type: string,
  payload?: unknown,
  opts: { runAt?: Date; priority?: number; maxAttempts?: number } = {},
) {
  return prisma.job.create({
    data: {
      type,
      payload: (payload ?? null) as object,
      runAt: opts.runAt ?? new Date(),
      priority: opts.priority ?? 0,
      maxAttempts: opts.maxAttempts ?? 3,
    },
  });
}
