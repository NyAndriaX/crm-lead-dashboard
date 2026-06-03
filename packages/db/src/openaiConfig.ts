/**
 * Configuration OpenAI par utilisateur (clé chiffrée en base).
 */
import { prisma } from "./client";
import { decryptOrNull } from "./piiCrypto";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type OpenAiCredentials = {
  apiKey: string;
  model: string;
};

export type OpenAiConfigPublic = {
  enabled: boolean;
  configured: boolean;
  model: string;
};

/** État public (sans clé) pour l'interface utilisateur. */
export async function getOpenAiConfigPublic(userId: string): Promise<OpenAiConfigPublic> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiEnabled: true, openAiApiKeyEnc: true, openAiModel: true },
  });
  if (!u) {
    return { enabled: false, configured: false, model: DEFAULT_OPENAI_MODEL };
  }
  return {
    enabled: u.openAiEnabled,
    configured: u.openAiApiKeyEnc != null,
    model: u.openAiModel?.trim() || DEFAULT_OPENAI_MODEL,
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
