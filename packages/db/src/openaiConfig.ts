/**
 * Configuration OpenAI par utilisateur (clé chiffrée en base).
 */
import { prisma } from "./client";
import { decryptOrNull } from "./piiCrypto";
import { normalizeAutoResponderMode } from "./autoResponderConfig";
import { parseKnowledgeDocs, type AiKnowledgeDoc } from "./openaiKnowledge";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type OpenAiCredentials = {
  apiKey: string;
  model: string;
};

export type OpenAiConfigPublic = {
  enabled: boolean;
  configured: boolean;
  model: string;
  autoResponderMode: string;
  autoResponderMeetingUrl: string | null;
  knowledgeText: string | null;
  knowledgeDocs: AiKnowledgeDoc[];
};

/** État public (sans clé) pour l'interface utilisateur. */
export async function getOpenAiConfigPublic(userId: string): Promise<OpenAiConfigPublic> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      openAiEnabled: true,
      openAiApiKeyEnc: true,
      openAiModel: true,
      autoResponderMode: true,
      autoResponderMeetingUrl: true,
      openAiKnowledgeText: true,
      openAiKnowledgeDocs: true,
    },
  });
  if (!u) {
    return {
      enabled: false,
      configured: false,
      model: DEFAULT_OPENAI_MODEL,
      autoResponderMode: "off",
      autoResponderMeetingUrl: null,
      knowledgeText: null,
      knowledgeDocs: [],
    };
  }
  return {
    enabled: u.openAiEnabled,
    configured: u.openAiApiKeyEnc != null,
    model: u.openAiModel?.trim() || DEFAULT_OPENAI_MODEL,
    autoResponderMode: normalizeAutoResponderMode(u.autoResponderMode),
    autoResponderMeetingUrl: u.autoResponderMeetingUrl,
    knowledgeText: u.openAiKnowledgeText,
    knowledgeDocs: parseKnowledgeDocs(u.openAiKnowledgeDocs),
  };
}

/** Résout les credentials OpenAI d'un utilisateur (null si désactivé ou absent). */
export async function resolveOpenAiCredentials(
  userId: string | null | undefined,
): Promise<OpenAiCredentials | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiEnabled: true, openAiApiKeyEnc: true, openAiModel: true },
  });
  if (!u?.openAiEnabled || !u.openAiApiKeyEnc) return null;
  const apiKey = decryptOrNull(u.openAiApiKeyEnc)?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: u.openAiModel?.trim() || DEFAULT_OPENAI_MODEL,
  };
}
