/**
 * Appel Chat Completions OpenAI (partagé web + worker).
 */
import type { OpenAiCredentials } from "./openaiConfig";

export type OpenAiMessage = { role: "system" | "user"; content: string };

export async function openAiChatCompletion(args: {
  credentials: OpenAiCredentials;
  messages: OpenAiMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}): Promise<{ ok: true; content: string } | { ok: false; status?: number; error?: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.credentials.apiKey}`,
      },
      body: JSON.stringify({
        model: args.credentials.model,
        messages: args.messages,
        temperature: args.temperature ?? 0.6,
        max_tokens: args.maxTokens ?? 600,
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: errText.slice(0, 500) };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, error: "empty_response" };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
