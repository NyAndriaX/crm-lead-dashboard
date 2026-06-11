/**
 * Base de connaissances IA par séquence de relance — stockée dans Sequence.config (JSON).
 */
import { prisma } from "./client";
import { getKnowledgeBaseContext } from "./knowledgeBase";
import type { OpenAiMessage } from "./openaiChat";

const MAX_CONTEXT_CHARS = 12_000;

export type SequenceKnowledgeConfig = {
  knowledgeBaseId?: string | null;
  knowledgeText?: string | null;
};

export function parseSequenceKnowledgeFromConfig(config: unknown): SequenceKnowledgeConfig {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  return {
    knowledgeBaseId: typeof c.knowledgeBaseId === "string" ? c.knowledgeBaseId : null,
    knowledgeText: typeof c.knowledgeText === "string" ? c.knowledgeText : null,
  };
}

export async function getSequenceKnowledgeContext(
  sequenceId: string | null | undefined,
  maxChars = MAX_CONTEXT_CHARS,
): Promise<string | null> {
  if (!sequenceId) return null;
  const seq = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    select: { config: true },
  });
  if (!seq) return null;

  const { knowledgeBaseId, knowledgeText } = parseSequenceKnowledgeFromConfig(seq.config);
  const parts: string[] = [];
  const kbShared = await getKnowledgeBaseContext(knowledgeBaseId, maxChars);
  if (kbShared) parts.push(kbShared);
  const text = knowledgeText?.trim();
  if (text) parts.push(text.slice(0, maxChars));
  if (parts.length === 0) return null;
  const joined = parts.join("\n\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

export async function injectSequenceKnowledgeIntoMessages(
  sequenceId: string | null | undefined,
  messages: OpenAiMessage[],
): Promise<OpenAiMessage[]> {
  const knowledge = await getSequenceKnowledgeContext(sequenceId);
  if (!knowledge) return messages;

  const block =
    "\n\n--- Base de connaissances séquence (relances) ---\n" +
    "Utilise ces informations pour personnaliser les emails de relance.\n\n" +
    knowledge;

  const idx = messages.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    return messages.map((m, i) =>
      i === idx ? { role: "system" as const, content: m.content + block } : m,
    );
  }
  return [{ role: "system" as const, content: block.trim() }, ...messages];
}
