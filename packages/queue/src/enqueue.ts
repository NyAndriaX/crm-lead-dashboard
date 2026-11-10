import { Prisma, prisma } from "@crm/db";

export type EnqueueOptions = {
  /** Date d'exécution au plus tôt (défaut : maintenant). */
  runAt?: Date;
  /** Plus grand = plus prioritaire (défaut 0). */
  priority?: number;
  /** Nombre d'essais avant FAILED (défaut 1 = pas de retry automatique). */
  maxAttempts?: number;
  /** Déduplication : si un job porte déjà cette clé, l'appel est ignoré. */
  uniqueKey?: string;
};

/**
 * Planifie un job ponctuel. Utilisable depuis l'API Next.js comme depuis le worker
 * (simple INSERT : aucun processeur à démarrer côté web).
 */
export async function enqueue(name: string, payload: unknown = {}, opts: EnqueueOptions = {}): Promise<void> {
  try {
    await prisma.queueJob.create({
      data: {
        name,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        runAt: opts.runAt ?? new Date(),
        priority: opts.priority ?? 0,
        maxAttempts: Math.max(1, opts.maxAttempts ?? 1),
        uniqueKey: opts.uniqueKey ?? null,
      },
    });
  } catch (e) {
    // Violation d'unicité sur uniqueKey : le job existe déjà → no-op.
    if (opts.uniqueKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return;
    throw e;
  }
}

/**
 * Déclare (ou met à jour) un job récurrent : un seul exemplaire par nom
 * (`uniqueKey = recurring:<nom>`), replanifié après chaque exécution.
 * Idempotent : sûr à chaque redémarrage du worker.
 */
export async function scheduleRecurring(name: string, everyMs: number, payload: unknown = {}): Promise<void> {
  await prisma.queueJob.upsert({
    where: { uniqueKey: `recurring:${name}` },
    create: {
      name,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
      uniqueKey: `recurring:${name}`,
      repeatEveryMs: everyMs,
      runAt: new Date(),
    },
    update: { repeatEveryMs: everyMs, status: "PENDING" },
  });
}

/** Convertit "5 minutes", "1 hour", "30 seconds", "1500" (ms) en millisecondes. */
export function parseInterval(value: string): number {
  const v = value.trim().toLowerCase();
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hours?|d|days?)$/);
  if (!m) throw new Error(`Intervalle invalide : "${value}"`);
  const n = Number(m[1]);
  const unit = m[2]!;
  if (unit.startsWith("ms") || unit.startsWith("milli")) return n;
  if (unit.startsWith("s")) return n * 1000;
  if (unit.startsWith("m")) return n * 60_000;
  if (unit.startsWith("h")) return n * 3_600_000;
  return n * 86_400_000;
}
