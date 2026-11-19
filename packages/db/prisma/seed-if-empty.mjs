/**
 * Initialise la base au démarrage du conteneur, uniquement si elle ne contient encore aucun utilisateur
 * (un redémarrage ou un réveil ne doit jamais réinjecter de données).
 *
 *  - SEED_MODE=prod : base propre via init-prod.mjs (compte administrateur, étapes du pipeline,
 *    configuration des tâches de fond ; aucune donnée de démonstration). Exige ADMIN_EMAIL et
 *    ADMIN_PASSWORD ; sans eux, rien n'est créé.
 *  - sinon : seed de démonstration (seed.mjs).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const users = await prisma.user.count();
await prisma.$disconnect();

const prod = process.env.SEED_MODE?.trim().toLowerCase() === "prod";

if (users > 0) {
  console.log(`[seed-if-empty] ${users} utilisateur(s) déjà présent(s) : rien à initialiser`);
} else if (prod && !(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)) {
  console.warn("[seed-if-empty] base vide (SEED_MODE=prod) sans ADMIN_EMAIL / ADMIN_PASSWORD : aucun compte créé");
} else {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), prod ? "init-prod.mjs" : "seed.mjs");
  const run = spawnSync(process.execPath, [script], { stdio: "inherit", env: process.env });
  process.exit(run.status ?? 1);
}
