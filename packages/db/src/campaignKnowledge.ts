/**
 * Base de connaissances IA par campagne — texte libre + fichiers Markdown.
 * Stockée dans Campaign.config (JSON).
 */
import { prisma } from "./client";
import { parseKnowledgeDocs, type AiKnowledgeDoc } from "./openaiKnowledge";
import type { OpenAiMessage } from "./openaiChat";

const MAX_CONTEXT_CHARS = 12_000;

export type CampaignKnowledgeConfig = {
  knowledgeText?: string | null;
  knowledgeDocs?: AiKnowledgeDoc[];
};

export function parseCampaignKnowledgeFromConfig(config: unknown): CampaignKnowledgeConfig {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  return {
    knowledgeText: typeof c.knowledgeText === "string" ? c.knowledgeText : null,
    knowledgeDocs: parseKnowledgeDocs(c.knowledgeDocs),
  };
}

export async function getCampaignKnowledgeContext(
  campaignId: string | null | undefined,
  maxChars = MAX_CONTEXT_CHARS,
): Promise<string | null> {
  if (!campaignId) return null;
  const camp = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { config: true },
  });
  if (!camp) return null;

  const { knowledgeText, knowledgeDocs } = parseCampaignKnowledgeFromConfig(camp.config);
  const parts: string[] = [];
  const text = knowledgeText?.trim();
  if (text) parts.push(text.slice(0, maxChars));
  for (const doc of knowledgeDocs ?? []) {
    parts.push(`### ${doc.name}\n${doc.content}`);
  }
  if (parts.length === 0) return null;
  const joined = parts.join("\n\n");
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

/** Ajoute la base de connaissances campagne au premier message système. */
export async function injectCampaignKnowledgeIntoMessages(
  campaignId: string | null | undefined,
  messages: OpenAiMessage[],
): Promise<OpenAiMessage[]> {
  if (!campaignId) return messages;
  const knowledge = await getCampaignKnowledgeContext(campaignId);
  if (!knowledge) return messages;

  const block =
    "\n\n--- Base de connaissances campagne (documents et consignes) ---\n" +
    "Utilise ces informations pour personnaliser les emails et réponses de cette campagne.\n\n" +
    knowledge;

  const idx = messages.findIndex((m) => m.role === "system");
  if (idx >= 0) {
    return messages.map((m, i) =>
      i === idx ? { role: "system" as const, content: m.content + block } : m,
    );
  }
  return [{ role: "system" as const, content: block.trim() }, ...messages];
}
