/**
 * Au démarrage du worker : nettoie les missions bloquées et **annule** les jobs
 * Agenda `scraping-run` incomplets (ne pas les relancer automatiquement).
 */
import { prisma } from "@crm/db";
import { agendaCollectionName } from "@crm/queue";
import { MongoClient } from "mongodb";

/** Ne pas interrompre un scraping long (défaut 4 h). */
const STALE_MS = Number(process.env.SCRAPING_STALE_MS ?? 4 * 60 * 60 * 1000);

export async function recoverStaleScrapingJobs(): Promise<{ missions: number; agendaJobs: number }> {
  const cutoff = new Date(Date.now() - STALE_MS);
  let missions = 0;
  let agendaJobs = 0;

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

  const uri = process.env.DATABASE_URL?.trim();
  if (uri) {
    const client = new MongoClient(uri);
    try {
      await client.connect();
      const col = client.db().collection(agendaCollectionName());
      // Jobs verrouillés sans fin = crash worker — on les supprime (pas de relance auto).
      const delLocked = await col.deleteMany({
        name: "scraping-run",
        lockedAt: { $exists: true, $ne: null },
        $or: [{ lastFinishedAt: null }, { lastFinishedAt: { $exists: false } }],
        lastRunAt: { $lt: cutoff },
      });
      agendaJobs += delLocked.deletedCount;
      if (delLocked.deletedCount > 0) {
        console.warn(
          `[worker] [scraping] ${delLocked.deletedCount} job(s) Agenda incomplet(s) annulé(s) (pas de relance auto)`,
        );
      }
    } finally {
      await client.close();
    }
  }

  return { missions, agendaJobs };
}
