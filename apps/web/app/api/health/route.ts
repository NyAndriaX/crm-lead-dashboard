import { NextResponse } from "next/server";
import { prisma } from "@crm/db";

/**
 * Healthcheck — P-03 (Disponibilité, monitoring/alerting).
 *
 * Consommé par Docker Compose ET les sondes externes (Uptime Robot, Datadog,
 * Better Uptime…). Renvoie 200 si sain, 503 si dégradé — l'alerting se
 * configure côté sonde externe (cf. docs/ops/monitoring.md).
 *
 * Métriques exposées :
 *  - db : ping MySQL (SELECT 1) + latence (ms)
 *  - worker : dernier job de la file terminé (détecte un worker mort)
 *  - uptime : secondes depuis le démarrage du process web
 */
export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  const checks: Record<string, unknown> = {};

  let db: "ok" | "down" = "ok";
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { status: "ok", latencyMs: Date.now() - t0 };
  } catch {
    db = "down";
    checks.db = { status: "down", latencyMs: Date.now() - t0 };
  }

  // Worker : dernier job de la file terminé (les jobs récurrents tournent au moins toutes les 5 min).
  let worker: "ok" | "stale" | "unknown" = "unknown";
  try {
    const last = await prisma.queueJob.findFirst({
      where: { lastFinishedAt: { not: null } },
      orderBy: { lastFinishedAt: "desc" },
      select: { lastFinishedAt: true },
    });
    const lastMs = last?.lastFinishedAt?.getTime() ?? 0;
    if (lastMs > 0) {
      const ageMin = (Date.now() - lastMs) / 60000;
      worker = ageMin <= 15 ? "ok" : "stale";
      checks.worker = { status: worker, lastJobAgeMin: Math.round(ageMin * 10) / 10 };
    } else {
      checks.worker = { status: "unknown", note: "Aucun job terminé (worker jamais lancé ?)" };
    }
  } catch {
    checks.worker = { status: "unknown" };
  }

  const status = db === "ok" ? (worker === "stale" ? "degraded" : "ok") : "degraded";

  return NextResponse.json(
    {
      status,
      service: "crm-web",
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
