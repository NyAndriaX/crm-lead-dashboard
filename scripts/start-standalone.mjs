/**
 * Démarrage PRODUCTION hors-Docker (sortie Next.js `output: standalone`).
 *
 * `next start` est incompatible avec `output: standalone`. Le serveur
 * standalone (apps/web/.next/standalone/apps/web/server.js) ne contient PAS
 * les assets statiques ni /public : il faut les recopier (ce que fait le
 * Dockerfile). Ce script reproduit ça pour un run local/bare-metal.
 *
 * Prérequis : `yarn run build` exécuté au préalable.
 * Usage     : `yarn start:prod`  (ou via Docker — recommandé en prod).
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webNext = path.join(root, "apps/web/.next");
const standaloneWeb = path.join(webNext, "standalone/apps/web");
const server = path.join(standaloneWeb, "server.js");

if (!existsSync(server)) {
  console.error(
    "✖ Build standalone introuvable (apps/web/.next/standalone/apps/web/server.js).\n" +
      "  Lancez d'abord : yarn run build",
  );
  process.exit(1);
}

// Copie idempotente des assets requis par le serveur standalone.
cpSync(path.join(webNext, "static"), path.join(standaloneWeb, ".next/static"), {
  recursive: true,
});
const pub = path.join(root, "apps/web/public");
if (existsSync(pub)) {
  cpSync(pub, path.join(standaloneWeb, "public"), { recursive: true });
}

const port = process.env.PORT ?? "3000";
console.log(`▶ CRM standalone — http://localhost:${port} (NODE_ENV=production)`);

const child = spawn("node", [server], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: port },
});
child.on("exit", (code) => process.exit(code ?? 0));
