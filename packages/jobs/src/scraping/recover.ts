/**
 * Au démarrage du worker : nettoie les missions bloquées et **annule** les jobs
 * `scraping-run` incomplets (ne pas les relancer automatiquement).
 */
import { prisma } from "@crm/db";
import { findOrphanedJobs } from "@crm/queue";

/** Ne pas interrompre un scraping long (défaut 4 h). */
const STALE_MS = Number(process.env.SCRAPING_STALE_MS ?? 4 * 60 * 60 * 1000);

export async function recoverStaleScrapingJobs(): Promise<{ missions: number; jobs: number }> {
  const cutoff = new Date(Date.now() - STALE_MS);
  let missions = 0;

  // Missions dont le process a été arrêté pendant l'exécution (redémarrage du serveur) :
  // en erreur tout de suite, sans attendre l'expiration du verrou de 4 h.
  const orphans = (await findOrphanedJobs()).filter((j) => j.name === "scraping-run");
  for (const job of orphans) {
    const missionId = (job.payload as { missionId?: string } | null)?.missionId;
    if (missionId) {
      const m = await prisma.scrapingMission.findUnique({ where: { id: missionId }, select: { logs: true, name: true } });
      if (m) {
        await prisma.scrapingMission.update({
          where: { id: missionId },
          data: { status: "error", logs: `${m.logs ?? ""}\n[recovery] Interrompu par un redémarrage du serveur. Cliquez « Lancer » pour réessayer.` },
        });
        missions++;
        console.warn(`[jobs] [scraping] mission interrompue récupérée : ${missionId} « ${m.name} »`);
      }
    }
    await prisma.queueJob.delete({ where: { id: job.id } }).catch(() => {});
  }

  const stuck = await prisma.scrapingMission.findMany({
    where: { status: { in: ["running", "queued"] } },
    select: { id: true, name: true, logs: true, createdAt: true },
  });

  for (const m of stuck) {
    const ref = m.createdAt;
    if (ref > cutoff) continue;
    await prisma.scrapingMission.update({
      where: { id: m.id },
      data: {
        status: "error",
        logs: `${m.logs ?? ""}\n[recovery] Interrompu (redémarrage worker). Cliquez « Lancer » pour réessayer.`,
      },
    });
    missions++;
    console.warn(`[worker] [scraping] mission récupérée (stale): ${m.id} « ${m.name} »`);
  }

  // Jobs restés RUNNING sans fin = crash worker — on les supprime (pas de relance auto).
  const { count: jobs } = await prisma.queueJob.deleteMany({
    where: { name: "scraping-run", status: "RUNNING", lastRunAt: { lt: cutoff } },
  });
  if (jobs > 0) {
    console.warn(`[worker] [scraping] ${jobs} job(s) scraping-run incomplet(s) annulé(s) (pas de relance auto)`);
  }

  return { missions, jobs };
}
