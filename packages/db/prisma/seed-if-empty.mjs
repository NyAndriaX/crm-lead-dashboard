/**
 * Lance le seed de démonstration uniquement si la base ne contient encore aucun utilisateur
 * (démo hébergée : un redémarrage du conteneur ne doit pas réinjecter les données).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const users = await prisma.user.count();
await prisma.$disconnect();

if (users > 0) {
  console.log(`[seed-if-empty] ${users} utilisateur(s) déjà présent(s) : seed ignoré`);
} else {
  const seed = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed.mjs");
  const run = spawnSync(process.execPath, [seed], { stdio: "inherit", env: process.env });
  process.exit(run.status ?? 1);
}
