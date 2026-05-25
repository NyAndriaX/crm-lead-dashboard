/**
 * Au démarrage du worker : nettoie les missions bloquées et annule les jobs
 * scraping-run incomplets (ne pas les relancer automatiquement).
 */
import { prisma } from "@crm/db";

const STALE_MS = Number(process.env.SCRAPING_STALE_MS ?? 4 * 60 * 60 * 1000);

export async function recoverStaleScrapingJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  let recovered = 0;

  const stuck = await prisma.scrapingMission.findMany({
    where: { status: { in: ["running", "queued"] } },
    select: { id: true, name: true, logs: true, createdAt: true },
  });

  for (const m of stuck) {
    if (m.createdAt > cutoff) continue;
    await prisma.scrapingMission.update({
      where: { id: m.id },
      data: {
        status: "error",
        logs: `${m.logs ?? ""}\n[recovery] Interrompu (redémarrage worker). Cliquez « Lancer » pour réessayer.`,
      },
    });
    recovered++;
    console.warn(`[worker] [scraping] mission récupérée (stale): ${m.id} « ${m.name} »`);
  }

  const staleJobs = await prisma.job.updateMany({
    where: {
      type: "scraping-run",
      status: "RUNNING",
      lockedAt: { lt: cutoff },
    },
    data: { status: "FAILED", lastError: "Stale job recovered at worker startup", lockedAt: null, lockedBy: null },
  });

  if (staleJobs.count > 0) {
    console.warn(`[worker] [scraping] ${staleJobs.count} job(s) incomplet(s) annulé(s)`);
    recovered += staleJobs.count;
  }

  return recovered;
}
