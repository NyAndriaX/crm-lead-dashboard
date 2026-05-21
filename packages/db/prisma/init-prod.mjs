/**
 * Initialisation PRODUCTION — base propre, AUCUNE donnée de démonstration.
 *
 * Crée strictement :
 *   - 1 compte ADMIN réel (identifiants OBLIGATOIRES via env, pas de défaut)
 *   - les étapes de pipeline standard (pour que le Kanban fonctionne)
 *   - la config worker (fuseau)
 *
 * Aucun lead, aucun compte démo (manager@/lucas.bernard@…), aucune inbox,
 * séquence, campagne. Le seed de démo (seed.mjs) crée TOUJOURS les
 * USER_FIXTURES — il ne convient donc pas à la prod ; d'où ce script dédié.
 *
 * Usage :
 *   ADMIN_EMAIL=ops@votredomaine.com ADMIN_PASSWORD='MotDePasseFort!' \
 *     yarn db:init-prod
 *
 * ⚠️ Idempotent sur l'admin (upsert) mais NE vide PAS la base : faites
 *    d'abord un reset si nécessaire (cf. README — prisma db push --force-reset).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PIPELINE_STAGES } from "./seed/fixtures.mjs";

const prisma = new PrismaClient();

const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const adminName = process.env.ADMIN_NAME ?? "Administrateur";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  fail("ADMIN_EMAIL manquant ou invalide (ex. ADMIN_EMAIL=ops@domaine.com).");
}
if (adminPassword.length < 10) {
  fail("ADMIN_PASSWORD manquant ou trop court (10 caractères minimum exigés en prod).");
}

async function main() {
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  let admin;
  if (existingAdmin) {
    admin = await prisma.user.update({
      where: { email: adminEmail },
      data: { name: adminName, role: "ADMIN", isActive: true },
      select: { id: true, email: true },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: adminName,
        role: "ADMIN",
        isActive: true,
      },
      select: { id: true, email: true },
    });
  }

  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const existing = await prisma.pipelineStage.findFirst({ where: { name: stage.name } });
    if (!existing) {
      await prisma.pipelineStage.create({
        data: { name: stage.name, order: i, color: stage.color },
      });
    }
  }

  const existingWorker = await prisma.workerConfig.findUnique({ where: { id: "default" } });
  if (!existingWorker) {
    await prisma.workerConfig.create({
      data: { id: "default", agendaTimezone: process.env.AGENDA_TIMEZONE || "Europe/Paris" },
    });
  }

  console.log("");
  console.log("┌────────────────────────────────────────────────");
  console.log("│  ✔ Init PRODUCTION terminée (aucune donnée démo)");
  console.log("├────────────────────────────────────────────────");
  console.log(`│  Admin   : ${admin.email}`);
  console.log(`│  Pipeline: ${PIPELINE_STAGES.length} étapes`);
  console.log("│  Leads/comptes démo : 0");
  console.log("└────────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
