/**
 * Lance le web ET le worker dans un seul terminal (confort local).
 *
 * Sans dépendance externe : spawn de 2 process Node, sorties préfixées
 * [web] / [worker], arrêt propre des deux sur Ctrl+C (SIGINT/SIGTERM).
 *
 * Usage (via package.json) :
 *   yarn dev:all    → next dev      + worker (tsx watch)
 *   yarn start:all  → standalone    + worker (tsx)         [prod-like]
 *
 * Les variables d'env (.env) sont déjà injectées par `dotenv -e .env --`
 * dans le script appelant : les enfants héritent de process.env.
 *
 * ⚠️ En PRODUCTION réelle, utilisez plutôt 2 conteneurs séparés
 * (docker-compose : services `nextjs` et `worker`). Ce lanceur couple
 * les deux dans un process parent — pratique en local, pas pour scaler.
 */
import { spawn } from "node:child_process";

const mode = process.argv[2] === "prod" ? "prod" : "dev";

const procs =
  mode === "prod"
    ? [
        { name: "web", cmd: "node", args: ["scripts/start-standalone.mjs"] },
        { name: "worker", cmd: "yarn", args: ["workspace", "@crm/worker", "start"] },
      ]
    : [
        { name: "web", cmd: "yarn", args: ["workspace", "@crm/web", "dev"] },
        { name: "worker", cmd: "yarn", args: ["workspace", "@crm/worker", "dev"] },
      ];

const COLOR = { web: "\x1b[36m", worker: "\x1b[35m", reset: "\x1b[0m" };
const children = [];
let shuttingDown = false;

function prefix(name, chunk) {
  const tag = `${COLOR[name] ?? ""}[${name}]${COLOR.reset} `;
  return chunk
    .toString()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => tag + l)
    .join("\n") + "\n";
}

for (const { name, cmd, args } of procs) {
  // `detached: true` → chaque enfant a son propre groupe de process.
  // Permet de tuer TOUT l'arbre (yarn → next/tsx) via kill(-pid), sinon
  // les petits-enfants (next dev, tsx) survivent au Ctrl+C.
  const child = spawn(cmd, args, { env: process.env, shell: false, detached: true });
  child.stdout.on("data", (d) => process.stdout.write(prefix(name, d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(name, d)));
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(prefix(name, `process terminé (code ${code}). Arrêt du lanceur.`));
    shutdown(code ?? 1);
  });
  children.push(child);
}

function killTree(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal); // PID négatif = groupe entier
  } catch {
    try { child.kill(signal); } catch { /* déjà mort */ }
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killTree(c, "SIGTERM");
  setTimeout(() => {
    for (const c of children) killTree(c, "SIGKILL");
    process.exit(code);
  }, 2500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  `${COLOR.web}[web]${COLOR.reset} + ${COLOR.worker}[worker]${COLOR.reset} démarrés (mode ${mode}). Ctrl+C pour tout arrêter.`,
);
