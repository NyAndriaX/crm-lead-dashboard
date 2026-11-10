/**
 * Clés des fournisseurs d'enrichissement (INT-03) : réglage de l'administrateur (table
 * `enrichmentProviderKeys`, clé chiffrée AES-256-GCM comme aiConfig), sinon variable d'environnement.
 * Mise en cache 30 s pour ne pas interroger la base à chaque lead enrichi.
 */
import { prisma } from "@crm/db";
import { decryptOrNull } from "@/lib/crypto";
import { ENRICHMENT_PROVIDERS, type EnrichmentProviderId } from "@/lib/enrichmentProviders";

export type ResolvedEnrichmentProvider = {
  id: EnrichmentProviderId;
  enabled: boolean;
  apiKey: string | null;
  /** `db` : clé saisie dans la Configuration ; `env` : variable d'environnement ; `none` : aucune clé. */
  keySource: "db" | "env" | "none";
  /** Activé et suffisamment configuré pour être appelé. */
  usable: boolean;
  updatedAt: Date | null;
};

export type EnrichmentConfig = Record<EnrichmentProviderId, ResolvedEnrichmentProvider>;

const TTL_MS = 30_000;
let cache: { at: number; value: EnrichmentConfig } | null = null;

export async function getEnrichmentConfig(): Promise<EnrichmentConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let rows: { provider: string; enabled: boolean; apiKeyEnc: Uint8Array | null; updatedAt: Date }[] = [];
  try {
    rows = await prisma.enrichmentProviderKey.findMany();
  } catch {
    /* table absente (migration non appliquée) ou base indisponible : variables d'environnement */
  }
  const value = {} as EnrichmentConfig;
  for (const def of ENRICHMENT_PROVIDERS) {
    const row = rows.find((r) => r.provider === def.id);
    const dbKey = row?.apiKeyEnc ? decryptOrNull(row.apiKeyEnc) : null;
    const envKey = def.envVar ? process.env[def.envVar]?.trim() || null : null;
    const apiKey = dbKey ?? envKey;
    const enabled = row?.enabled ?? true;
    value[def.id] = {
      id: def.id,
      enabled,
      apiKey,
      keySource: dbKey ? "db" : envKey ? "env" : "none",
      usable: enabled && (!def.needsKey || !!apiKey),
      updatedAt: row?.updatedAt ?? null,
    };
  }
  cache = { at: Date.now(), value };
  return value;
}

/** À appeler après un changement de configuration (même process). */
export function invalidateEnrichmentConfig(): void {
  cache = null;
}
