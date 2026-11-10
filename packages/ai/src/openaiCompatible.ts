/**
 * Exécution d'une tâche IA via une API Chat Completions (OpenAI, DeepSeek, Mistral, Gemini, Ollama…).
 * Les instructions viennent du même fichier `.claude/skills/<skill>/SKILL.md` que pour Claude :
 * un seul endroit où vivent les prompts, quel que soit le fournisseur.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResolvedAiConfig } from "./config";

type JsonSchema = Record<string, unknown>;

/** Corps du skill sans l'en-tête YAML (name/description). */
export function skillInstructions(root: string, skill: string): string | null {
  try {
    const raw = readFileSync(path.join(root, ".claude", "skills", skill, "SKILL.md"), "utf8");
    return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  } catch {
    return null;
  }
}

/** Validation minimale d'une valeur contre le sous-ensemble de JSON Schema utilisé par nos tâches. */
export function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as JsonSchema[]).some((s) => matchesSchema(value, s));
  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value)) return false;
  const type = schema.type as string | string[] | undefined;
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.length) {
    const ok = types.some((t) =>
      t === "null" ? value === null
      : t === "array" ? Array.isArray(value)
      : t === "integer" ? Number.isInteger(value)
      : t === "number" ? typeof value === "number" && Number.isFinite(value)
      : t === "object" ? !!value && typeof value === "object" && !Array.isArray(value)
      : typeof value === t,
    );
    if (!ok) return false;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
  }
  if (typeof value === "string" && typeof schema.maxLength === "number" && value.length > schema.maxLength * 1.5) return false;
  if (Array.isArray(value) && schema.items) return value.every((v) => matchesSchema(v, schema.items as JsonSchema));
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) if (!(key in obj)) return false;
    for (const [key, sub] of Object.entries(schema.properties as Record<string, JsonSchema>)) {
      if (key in obj && !matchesSchema(obj[key], sub)) return false;
    }
  }
  return true;
}

/** Extrait l'objet JSON d'une réponse (tolère un bloc ```json … ```). */
function parseJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced?.[1] ?? content).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function runChatCompletion<T>(args: {
  config: ResolvedAiConfig;
  root: string;
  skill: string;
  systemPrompt: string;
  input: unknown;
  schema: JsonSchema;
  fast: boolean;
  timeoutMs: number;
}): Promise<{ output: T | null; model: string | null; error?: string }> {
  const { config } = args;
  const model = (args.fast ? config.fastModel : null) || config.model;
  if (!config.baseUrl || !model) return { output: null, model, error: "point d'accès ou modèle manquant" };
  const instructions = skillInstructions(args.root, args.skill);
  if (!instructions) return { output: null, model, error: `skill ${args.skill} introuvable` };

  const system = [
    args.systemPrompt,
    "Instructions de la tâche :",
    instructions,
    "Réponds UNIQUEMENT par un objet JSON valide conforme à ce schéma, sans texte autour :",
    JSON.stringify(args.schema),
  ].join("\n\n");

  const responseFormat =
    config.provider.jsonMode === "json_schema"
      ? { type: "json_schema", json_schema: { name: args.skill.replace(/[^a-zA-Z0-9_-]/g, "_"), schema: args.schema, strict: false } }
      : { type: "json_object" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: responseFormat,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(args.input) },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { output: null, model, error: `HTTP ${res.status} ${text.slice(0, 160)}` };
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = parseJson(body.choices?.[0]?.message?.content ?? "");
    if (parsed == null) return { output: null, model, error: "réponse non JSON" };
    if (!matchesSchema(parsed, args.schema)) return { output: null, model, error: "réponse hors schéma" };
    return { output: parsed as T, model };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { output: null, model, error: aborted ? `timeout ${args.timeoutMs} ms` : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
