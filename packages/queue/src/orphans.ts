import { hostname } from "node:os";
import { prisma } from "@crm/db";

/** Le process `pid` de cette machine existe-t-il encore ? */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Jobs RUNNING verrouillés par un process mort de CETTE machine (arrêt brutal, redémarrage) —
 * ou par un process de même pid que l'actuel (redémarrage de conteneur : souvent pid 1), qui ne
 * peut avoir aucun job en cours puisqu'il démarre. Les verrous d'autres machines ne sont pas touchés.
 */
export async function findOrphanedJobs(): Promise<{ id: string; name: string; payload: unknown }[]> {
  const host = hostname();
  const rows = await prisma.queueJob.findMany({
    where: { status: "RUNNING", lockedBy: { startsWith: `${host}:` } },
    select: { id: true, name: true, payload: true, lockedBy: true },
  });
  return rows.filter((r) => {
    const pid = Number(r.lockedBy?.slice(host.length + 1));
    return !Number.isFinite(pid) || pid === process.pid || !isAlive(pid);
  });
}

/** Rend immédiatement éligibles les jobs orphelins (au lieu d'attendre l'expiration du verrou). */
export async function releaseOrphanedJobs(exclude: string[] = []): Promise<number> {
  const orphans = (await findOrphanedJobs()).filter((j) => !exclude.includes(j.name));
  if (orphans.length === 0) return 0;
  const { count } = await prisma.queueJob.updateMany({
    where: { id: { in: orphans.map((o) => o.id) }, status: "RUNNING" },
    data: { lockedUntil: new Date(), lockedBy: null },
  });
  return count;
}
