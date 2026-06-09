/**
 * Appel Chat Completions OpenAI (partagé web + worker).
 */
import type { OpenAiCredentials } from "./openaiConfig";
import { recordOpenAiUsage, type OpenAiUsageFeature } from "./openaiUsage";

export type OpenAiMessage = { role: "system" | "user"; content: string };

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export async function openAiChatCompletion(args: {
  credentials: OpenAiCredentials;
  messages: OpenAiMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** Si fourni, enregistre la consommation de tokens pour cet utilisateur. */
  track?: { userId: string; feature: OpenAiUsageFeature | string };
}): Promise<
  | { ok: true; content: string; usage?: { prompt: number; completion: number; total: number } }
  | { ok: false; status?: number; error?: string }
> {
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
    const json = (await res.json()) as ChatResponse;
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, error: "empty_response" };

    let prompt = json.usage?.prompt_tokens ?? 0;
    let completion = json.usage?.completion_tokens ?? 0;
    let total = json.usage?.total_tokens ?? prompt + completion;

    if (args.track && total <= 0) {
      const promptChars = args.messages.reduce((s, m) => s + m.content.length, 0);
      prompt = Math.max(1, Math.ceil(promptChars / 4));
      completion = Math.max(1, Math.ceil(content.length / 4));
      total = prompt + completion;
    }

    if (args.track && total > 0) {
      await recordOpenAiUsage({
        userId: args.track.userId,
        feature: args.track.feature,
        model: args.credentials.model,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
      });
    }

    return {
      ok: true,
      content,
      usage: { prompt, completion, total },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
