/**
 * Réinitialisation PRODUCTION — vide toute la base MySQL et recrée l'admin.
 *
 * Effets :
 *   - supprime leads, campagnes, jobs worker, OAuth Microsoft (IMAP/SMTP), etc.
 *   - invalide toutes les sessions navigateur (utilisateurs supprimés + nouveaux tokens)
 *   - recrée l'admin via init-prod.mjs
 *
 * Usage local :
 *   CONFIRM_DB_RESET=true ADMIN_EMAIL=... ADMIN_PASSWORD='...' \
 *     node packages/db/scripts/reset-prod.mjs
 *
 * Docker / Dokploy (one-shot) :
 *   RUN_MODE=db-reset CONFIRM_DB_RESET=true ADMIN_EMAIL=... ADMIN_PASSWORD='...'
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(dbRoot, "prisma", "schema.prisma");

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: dbRoot,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) {
    fail(`Commande échouée: ${cmd} ${args.join(" ")}`);
  }
}

const confirmed =
  process.env.CONFIRM_DB_RESET === "true" || process.env.CONFIRM_DB_RESET === "1";
if (!confirmed) {
  fail(
    "CONFIRM_DB_RESET=true est obligatoire. Cette opération efface TOUTES les données.",
  );
}

if (!process.env.DATABASE_URL?.trim()) {
  fail("DATABASE_URL manquant.");
}

const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim();
const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
if (!adminEmail || !adminPassword) {
  fail(
    "ADMIN_EMAIL et ADMIN_PASSWORD sont requis pour recréer l'admin après reset.",
  );
}

console.log("");
console.log("⚠  RESET PRODUCTION — suppression de toutes les données CRM");
console.log("   (OAuth Microsoft, sessions, leads, jobs, comptes utilisateurs…)");
console.log("");

run("npx", ["prisma", "db", "push", "--force-reset", "--skip-generate", `--schema=${schemaPath}`]);
run("npx", ["prisma", "generate", `--schema=${schemaPath}`]);
run("node", [path.join(dbRoot, "prisma", "init-prod.mjs")]);

console.log("");
console.log("✔ Base réinitialisée. Tous les navigateurs doivent se reconnecter.");
console.log("  → Remettez RUN_MODE=all (ou web) avant le prochain démarrage normal.");
