/**
 * GET /api/admin/enrichment-providers — fournisseurs d'enrichissement et état de leur clé (jamais renvoyée).
 * PUT /api/admin/enrichment-providers — active / désactive un fournisseur, enregistre ou supprime sa clé
 *     (chiffrée AES-256-GCM). ADMIN uniquement (INT-03).
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { ENRICHMENT_PROVIDERS, type EnrichmentProviderId } from "@/lib/enrichmentProviders";
import { getEnrichmentConfig, invalidateEnrichmentConfig } from "@/lib/services/enrichmentConfig";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  provider: z.enum(ENRICHMENT_PROVIDERS.map((p) => p.id) as [EnrichmentProviderId, ...EnrichmentProviderId[]]),
  enabled: z.boolean(),
  /** `undefined` : clé inchangée ; `null` : clé supprimée (repli sur l'environnement) ; texte : nouvelle clé. */
  apiKey: z.string().trim().min(1).max(4096).nullable().optional(),
});

async function view() {
  invalidateEnrichmentConfig();
  const cfg = await getEnrichmentConfig();
  return ENRICHMENT_PROVIDERS.map((p) => ({
    id: p.id,
    enabled: cfg[p.id].enabled,
    usable: cfg[p.id].usable,
    keySource: cfg[p.id].keySource,
    updatedAt: cfg[p.id].updatedAt,
  }));
}

export const GET = handler(async () => {
  await requirePermission("settings:manage");
  return json({ data: await view() });
});

export const PUT = handler(async (req) => {
  const session = await requirePermission("settings:manage");
  const input = await parseBody(req, putSchema);
  const def = ENRICHMENT_PROVIDERS.find((p) => p.id === input.provider)!;
  const data = {
    enabled: input.enabled,
    updatedBy: session.sub,
    // Fournisseur sans clé (API publique) : rien à stocker.
    ...(input.apiKey === undefined || !def.needsKey ? {} : { apiKeyEnc: input.apiKey === null ? null : encrypt(input.apiKey) }),
  };
  await prisma.enrichmentProviderKey.upsert({
    where: { provider: input.provider },
    create: { provider: input.provider, ...data },
    update: data,
  });
  invalidateEnrichmentConfig();
  await audit({
    userId: session.sub,
    action: "enrichment.provider.update",
    entityType: "EnrichmentProviderKey",
    entityId: input.provider,
    ip: clientIp(req),
    diff: { enabled: input.enabled, apiKeyChanged: input.apiKey !== undefined && def.needsKey },
  });
  return json({ data: await view() });
});
