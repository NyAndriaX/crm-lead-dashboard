/**
 * @crm/ai — exécution des tâches IA du CRM, quel que soit le fournisseur choisi par l'administrateur.
 *
 * Une tâche IA = un skill versionné `.claude/skills/<nom>/SKILL.md` (les instructions) + un JSON Schema
 * (`schemas.ts`, la forme de la sortie). Le fournisseur actif (Configuration › Intelligence artificielle,
 * table `aiConfig`) décide du moteur :
 *
 *  - Claude Skills (défaut) : le CLI Claude Code exécute le skill en mode headless,
 *      claude -p "/<skill> <json>" --output-format json --json-schema '<schema>' …
 *    Les données passent en argument du skill (sur stdin le skill ne serait pas chargé).
 *    Authentification : jeton CLAUDE_CODE_OAUTH_TOKEN (réglage admin ou env) ; ANTHROPIC_API_KEY est
 *    retiré de l'environnement enfant. Pas de choix de modèle exposé : chaque tâche est un skill.
 *  - OpenAI, DeepSeek, Mistral, Gemini, Ollama, service compatible OpenAI : API Chat Completions avec le
 *    même SKILL.md comme instructions (openaiCompatible.ts), sortie validée contre le même schéma.
 *
 * Ne jette jamais : `null` en cas d'IA désactivée, d'indisponibilité, de timeout ou de sortie invalide —
 * l'appelant retombe sur son fallback déterministe.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { getAiConfig, type ResolvedAiConfig } from "./config";
import { runChatCompletion } from "./openaiCompatible";

export * from "./schemas";
export { AI_PROVIDERS, getProvider, type AiProvider, type AiProviderId } from "./providers";
export { getAiConfig, invalidateAiConfig, isAiEnabled, type ResolvedAiConfig } from "./config";

export type SkillName =
  | "crm-lead-brief"
  | "crm-email-personalize"
  | "crm-reply-categorize"
  | "crm-email-variants"
  | "crm-auto-reply"
  | "crm-scraping-plan";

export type JsonSchema = Record<string, unknown>;

/** Alias de modèle du CLI : `haiku` (rapide), `sonnet` (rédaction), `opus`. */
export type ClaudeModel = "haiku" | "sonnet" | "opus" | (string & {});

const SYSTEM_PROMPT =
  "Tu es le moteur d'exécution des skills d'un CRM B2B francophone. " +
  "Applique strictement le skill invoqué aux données JSON fournies en entrée " +
  "et renvoie uniquement la sortie structurée demandée. N'invente aucun fait " +
  "absent des données.";

/** Dossier contenant `.claude/skills` : CLAUDE_SKILLS_ROOT, sinon remontée depuis cwd. */
function skillsRoot(): string | null {
  const fromEnv = process.env.CLAUDE_SKILLS_ROOT?.trim();
  if (fromEnv) return fromEnv;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, ".claude", "skills"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Linux limite un argument à 128 Kio (MAX_ARG_STRLEN) : marge de sécurité.
const MAX_INPUT_BYTES = 100_000;

// Sémaphore : une campagne de 200 leads ne doit pas lancer 200 appels IA en parallèle.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.AI_MAX_CONCURRENCY ?? process.env.CLAUDE_MAX_CONCURRENCY ?? 2) || 2);
let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENCY) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

type CliResult = {
  is_error?: boolean;
  subtype?: string;
  structured_output?: unknown;
  result?: string;
};

export type SkillRun<T> = {
  output: T | null;
  provider: string;
  model: string | null;
  ms: number;
  error?: string;
};

/**
 * Exécute une tâche IA avec le fournisseur actif et renvoie sa sortie structurée (ou `null`).
 *
 * @param input  données métier (JSON)
 * @param schema JSON Schema que la sortie doit respecter
 * @param model  indication de gabarit : `haiku` = tâche en volume (modèle rapide), sinon rédaction
 */
export async function runSkill<T>(args: {
  skill: SkillName;
  input: unknown;
  schema: JsonSchema;
  model?: ClaudeModel;
  timeoutMs?: number;
}): Promise<T | null> {
  return (await runSkillDetailed<T>(args)).output;
}

/** Comme runSkill, avec le détail d'exécution (fournisseur, modèle, durée, erreur) — test de connexion. */
export async function runSkillDetailed<T>(args: {
  skill: SkillName;
  input: unknown;
  schema: JsonSchema;
  model?: ClaudeModel;
  timeoutMs?: number;
  config?: ResolvedAiConfig;
}): Promise<SkillRun<T>> {
  const config = args.config ?? (await getAiConfig());
  const startedAt = Date.now();
  const done = (output: T | null, model: string | null, error?: string): SkillRun<T> => {
    const run = { output, provider: config.provider.id, model, ms: Date.now() - startedAt, error };
    if (error) console.warn(`[ai] ${args.skill} via ${config.provider.id} KO : ${error}`);
    else console.info(`[ai] ${args.skill} OK (${config.provider.id}${model ? ` · ${model}` : ""}, ${run.ms} ms)`);
    return run;
  };
  if (!config.enabled) return done(null, null, "IA désactivée");

  const cwd = skillsRoot();
  if (!cwd) return done(null, null, "dossier .claude/skills introuvable");
  const payload = JSON.stringify(args.input);
  if (Buffer.byteLength(payload, "utf8") > MAX_INPUT_BYTES) return done(null, null, `entrée trop volumineuse (> ${MAX_INPUT_BYTES} octets)`);
  const timeoutMs = args.timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS ?? process.env.CLAUDE_TIMEOUT_MS ?? 120_000) || 120_000);

  await acquire();
  try {
    if (config.provider.kind === "openai-compatible") {
      const r = await runChatCompletion<T>({
        config, root: cwd, skill: args.skill, systemPrompt: SYSTEM_PROMPT, input: args.input, schema: args.schema,
        fast: args.model === "haiku", timeoutMs,
      });
      return done(r.output, r.model, r.error);
    }
    return await runClaudeSkill<T>(config, cwd, args.skill, payload, args.schema, args.model, timeoutMs, done);
  } finally {
    release();
  }
}

/** Claude Skills : CLI Claude Code en mode headless (aucun outil, aucune config utilisateur). */
async function runClaudeSkill<T>(
  config: ResolvedAiConfig,
  cwd: string,
  skill: SkillName,
  payload: string,
  schema: JsonSchema,
  modelHint: ClaudeModel | undefined,
  timeoutMs: number,
  done: (output: T | null, model: string | null, error?: string) => SkillRun<T>,
): Promise<SkillRun<T>> {
  const bin = process.env.CLAUDE_BIN?.trim() || "claude";
  // Gabarit interne (non exposé à l'administrateur) : rapide pour le volume, rédaction sinon.
  const model = process.env.CLAUDE_MODEL?.trim() || modelHint || "sonnet";
  const cliArgs = [
    "-p", `/${skill} ${payload}`,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--model", model,
    "--system-prompt", SYSTEM_PROMPT,
    "--tools", "",
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  if (config.apiKey) env.CLAUDE_CODE_OAUTH_TOKEN = config.apiKey;

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, cliArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`timeout ${timeoutMs} ms`));
      }, timeoutMs);
      child.stdout.on("data", (c: Buffer) => (out += c.toString("utf8")));
      child.stderr.on("data", (c: Buffer) => (err += c.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`exit ${code} — ${(err || out).slice(0, 300)}`));
      });
    });
    const parsed = JSON.parse(stdout) as CliResult;
    if (parsed.is_error || parsed.structured_output == null) return done(null, null, `sans sortie structurée (${parsed.subtype ?? "?"})`);
    return done(parsed.structured_output as T, null);
  } catch (e) {
    return done(null, null, e instanceof Error ? e.message : String(e));
  }
}
