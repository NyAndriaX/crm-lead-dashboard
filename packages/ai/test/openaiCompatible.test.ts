import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { matchesSchema, runChatCompletion, skillInstructions } from "../src/openaiCompatible";
import { replyCategorySchema } from "../src/schemas";
import { getProvider } from "../src/providers";
import type { ResolvedAiConfig } from "../src/config";

const ROOT = path.resolve(__dirname, "../../..");

test("les instructions viennent du SKILL.md, sans l'en-tête YAML", () => {
  const txt = skillInstructions(ROOT, "crm-reply-categorize");
  assert.ok(txt && txt.length > 100);
  assert.ok(!txt!.startsWith("---"));
});

test("validation de schéma : catégorie connue acceptée, inconnue refusée", () => {
  assert.equal(matchesSchema({ category: "interesse" }, replyCategorySchema as Record<string, unknown>), true);
  assert.equal(matchesSchema({ category: "peut-etre" }, replyCategorySchema as Record<string, unknown>), false);
  assert.equal(matchesSchema({}, replyCategorySchema as Record<string, unknown>), false);
});

test("appel d'un fournisseur compatible OpenAI (DeepSeek simulé)", async () => {
  const seen: { url?: string; auth?: string | null; body?: { model: string; messages: { content: string }[] } } = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.auth = new Headers(init.headers).get("authorization");
    seen.body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"category":"rappel"}\n```' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const config: ResolvedAiConfig = {
      enabled: true, provider: getProvider("deepseek")!, model: "deepseek-chat", fastModel: null,
      baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-test", source: "db",
    };
    const r = await runChatCompletion<{ category: string }>({
      config, root: ROOT, skill: "crm-reply-categorize", systemPrompt: "SYS", input: { subject: "x", body: "rappelez-moi" },
      schema: replyCategorySchema as Record<string, unknown>, fast: true, timeoutMs: 5000,
    });
    assert.deepEqual(r.output, { category: "rappel" });
    assert.equal(seen.url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(seen.auth, "Bearer sk-test");
    assert.equal(seen.body!.model, "deepseek-chat"); // pas de modèle rapide défini : modèle principal
    assert.ok(seen.body!.messages[0]!.content.includes("Instructions de la tâche"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
