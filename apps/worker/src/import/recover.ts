/**
 * Au démarrage du worker : marque les imports bloqués en `running` depuis trop longtemps.
 */
import { prisma } from "@crm/db";

const STALE_MS = Number(process.env.IMPORT_RUNNING_STALE_MS ?? 30 * 60 * 1000);

export async function recoverStaleImportJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stuck = await prisma.importJob.findMany({
    where: {
      status: "running",
      createdAt: { lt: cutoff },
    },
    select: { id: true, fileName: true },
  });

  if (!stuck.length) return 0;

  for (const job of stuck) {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        errorReport:
          "Import interrompu (délai dépassé). Le worker n'a pas traité le fichier — vérifiez RUN_MODE=all ou relancez l'import.",
      },
    });
    console.warn(`[worker] [import] job récupéré (stale): ${job.id} « ${job.fileName} »`);
  }

  return stuck.length;
}
