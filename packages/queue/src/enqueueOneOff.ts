import { prisma } from "@crm/db";
import type { EnqueueOneOffOptions } from "./types";

function parsePriority(p: number | string | undefined): number {
  if (p === undefined) return 0;
  if (typeof p === "number") return p;
  const map: Record<string, number> = {
    lowest: -20,
    low: -10,
    normal: 0,
    high: 10,
    highest: 20,
  };
  return map[p.toLowerCase()] ?? 0;
}

export type { EnqueueOneOffOptions };

export async function enqueueOneOff(
  _queueRef: unknown,
  name: string,
  data: unknown,
  opts: EnqueueOneOffOptions = {},
): Promise<void> {
  await prisma.job.create({
    data: {
      type: name,
      payload: (data ?? {}) as object,
      status: "PENDING",
      priority: parsePriority(opts.priority),
      runAt: opts.runAt ?? new Date(),
    },
  });
}
