/**
 * Supprime les doublons de jobs récurrents créés par les anciens redémarrages worker.
 *
 * Usage :
 *   node packages/db/scripts/cleanup-recurring-jobs.mjs
 *   node packages/db/scripts/cleanup-recurring-jobs.mjs imap-sync
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_JOB_TYPES = ["imap-sync", "sequence-tick", "scraping-scheduler"];

function isRecurringPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.recurring === true);
}

async function cleanupJobType(type) {
  const jobs = await prisma.job.findMany({
    where: {
      type,
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      payload: true,
      runAt: true,
    },
  });

  const recurringJobs = jobs.filter((job) => isRecurringPayload(job.payload));
  const runningJobs = recurringJobs.filter((job) => job.status === "RUNNING");
  const pendingJobs = recurringJobs.filter((job) => job.status === "PENDING");

  let idsToDelete = [];
  if (runningJobs.length > 0) {
    idsToDelete = pendingJobs.map((job) => job.id);
  } else {
    idsToDelete = pendingJobs.slice(1).map((job) => job.id);
  }

  if (idsToDelete.length === 0) {
    console.log(`[cleanup-recurring-jobs] ${type}: rien à supprimer (${recurringJobs.length} job récurrent actif).`);
    return;
  }

  const result = await prisma.job.deleteMany({
    where: {
      id: { in: idsToDelete },
      status: "PENDING",
    },
  });

  console.log(
    `[cleanup-recurring-jobs] ${type}: ${result.count} doublon(s) supprimé(s), ` +
      `${recurringJobs.length - result.count} conservé(s).`,
  );
}

async function main() {
  const jobTypes = process.argv.slice(2);
  const types = jobTypes.length > 0 ? jobTypes : DEFAULT_JOB_TYPES;

  for (const type of types) {
    await cleanupJobType(type);
  }

  console.log("[cleanup-recurring-jobs] Terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
