/**
 * Configuration OpenAI personnelle par utilisateur.
 */
import {
  prisma,
  getOpenAiConfigPublic,
  openAiChatCompletion,
  resolveOpenAiCredentials,
  normalizeAutoResponderMode,
} from "@crm/db";
import { encryptOrNull } from "@/lib/crypto";
import { ApiError } from "@/lib/api";

export { getOpenAiConfigPublic };

export type UpsertOpenAiConfigInput = {
  enabled?: boolean;
  model?: string;
  /** Nouvelle clé ; chaîne vide = conserver l'existante. */
  apiKey?: string;
  /** Si true, supprime la clé enregistrée. */
  clearApiKey?: boolean;
  autoResponderMode?: string;
  autoResponderMeetingUrl?: string | null;
};

export async function upsertOpenAiConfig(userId: string, input: UpsertOpenAiConfigInput) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { openAiApiKeyEnc: true },
  });
  if (!existing) throw new ApiError(404, "Utilisateur introuvable", "not_found");

  const data: {
    openAiEnabled?: boolean;
    openAiModel?: string;
    openAiApiKeyEnc?: Buffer | null;
    autoResponderMode?: string;
    autoResponderMeetingUrl?: string | null;
  } = {};

  if (input.enabled !== undefined) data.openAiEnabled = input.enabled;
  if (input.model !== undefined) {
    const m = input.model.trim();
    data.openAiModel = m || "gpt-4o-mini";
  }
  if (input.autoResponderMode !== undefined) {
    data.autoResponderMode = normalizeAutoResponderMode(input.autoResponderMode);
  }
  if (input.autoResponderMeetingUrl !== undefined) {
    const url = input.autoResponderMeetingUrl?.trim();
    data.autoResponderMeetingUrl = url || null;
  }
  if (input.clearApiKey) {
    data.openAiApiKeyEnc = null;
    data.openAiEnabled = false;
  } else if (input.apiKey !== undefined && input.apiKey.trim() !== "") {
    data.openAiApiKeyEnc = encryptOrNull(input.apiKey.trim());
    if (input.enabled === undefined) data.openAiEnabled = true;
  }

  await prisma.user.update({ where: { id: userId }, data });
  return getOpenAiConfigPublic(userId);
}

export async function testOpenAiConfig(userId: string): Promise<{ ok: boolean; message: string }> {
  const creds = await resolveOpenAiCredentials(userId);
  if (!creds) {
    return {
      ok: false,
      message: "Activez l'intégration et enregistrez une clé API valide.",
    };
  }
  const res = await openAiChatCompletion({
    credentials: creds,
    messages: [
      { role: "user", content: 'Réponds uniquement avec le JSON {"ok":true}.' },
    ],
    maxTokens: 16,
    temperature: 0,
    json: true,
    track: { userId, feature: "config_test" },
  });
  if (!res.ok) {
    return {
      ok: false,
      message: res.status === 401
        ? "Clé API refusée par OpenAI (vérifiez la clé)."
        : `Échec du test OpenAI${res.status ? ` (HTTP ${res.status})` : ""}.`,
    };
  }
  return { ok: true, message: "Connexion OpenAI réussie." };
}
