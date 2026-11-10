/**
 * Configuration IA active : réglage de l'administrateur (table `aiConfig`), sinon valeurs d'environnement.
 * Mise en cache 30 s pour ne pas interroger la base à chaque appel.
 */
import { createDecipheriv } from "node:crypto";
import { prisma } from "@crm/db";
import { getProvider, type AiProvider, type AiProviderId } from "./providers";

export type ResolvedAiConfig = {
  enabled: boolean;
  provider: AiProvider;
  model: string | null;
  fastModel: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  /** `db` : réglé par l'administrateur ; `env` : valeurs par défaut du serveur. */
  source: "db" | "env";
};

const TTL_MS = 30_000;
let cache: { at: number; value: ResolvedAiConfig } | null = null;

/** Même format que apps/web/lib/crypto.ts : iv(12) ‖ tag(16) ‖ texte chiffré. */
function decryptSecret(buf: Uint8Array | null): string | null {
  if (!buf || buf.length < 29) return null;
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) return null;
  try {
    const data = Buffer.from(buf);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(hex, "hex"), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function fromEnv(): ResolvedAiConfig {
  return {
    enabled: (process.env.CLAUDE_SKILLS_ENABLED ?? "").trim().toLowerCase() === "true",
    provider: getProvider("claude-skills")!,
    model: null,
    fastModel: null,
    baseUrl: null,
    apiKey: null,
    source: "env",
  };
}

export async function getAiConfig(): Promise<ResolvedAiConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = fromEnv();
  try {
    const row = await prisma.aiConfig.findUnique({ where: { id: "default" } });
    const provider = row ? getProvider(row.provider) : null;
    if (row && provider) {
      value = {
        enabled: row.enabled,
        provider,
        model: row.model?.trim() || provider.defaultModel || null,
        fastModel: row.fastModel?.trim() || provider.defaultFastModel || null,
        baseUrl: row.baseUrl?.trim() || provider.baseUrl || null,
        apiKey: decryptSecret(row.apiKeyEnc),
        source: "db",
      };
    }
  } catch {
    /* table absente (migration non appliquée) ou base indisponible : valeurs d'environnement */
  }
  cache = { at: Date.now(), value };
  return value;
}

/** À appeler après un changement de configuration (même process). */
export function invalidateAiConfig(): void {
  cache = null;
}

/** L'IA est-elle utilisable (activée et suffisamment configurée) ? */
export async function isAiEnabled(): Promise<boolean> {
  const c = await getAiConfig();
  if (!c.enabled) return false;
  if (c.provider.kind === "skills") return true;
  if (c.provider.needsKey && !c.apiKey) return false;
  return !!(c.baseUrl && c.model);
}

export type { AiProviderId };
