/**
 * GET /api/admin/ai-config — fournisseur d'IA actif (la clé n'est jamais renvoyée).
 * PUT /api/admin/ai-config — choisit le fournisseur, le modèle et la clé d'API. ADMIN uniquement.
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { AI_PROVIDERS, getAiConfig, invalidateAiConfig } from "@crm/ai";
import { handler, json, parseBody, requireRole, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const CONFIG_ID = "default";

const putSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDERS.map((p) => p.id) as [string, ...string[]]),
  model: z.string().trim().max(120).nullable().optional(),
  fastModel: z.string().trim().max(120).nullable().optional(),
  baseUrl: z.string().trim().url().max(255).nullable().optional(),
  /** `undefined` : clé inchangée ; `null` : clé supprimée ; texte : nouvelle clé. */
  apiKey: z.string().trim().min(1).max(4096).nullable().optional(),
});

async function view() {
  const row = await prisma.aiConfig.findUnique({ where: { id: CONFIG_ID } });
  const active = await getAiConfig();
  return {
    enabled: active.enabled,
    provider: active.provider.id,
    model: row?.model ?? null,
    fastModel: row?.fastModel ?? null,
    baseUrl: row?.baseUrl ?? null,
    hasApiKey: !!row?.apiKeyEnc,
    source: active.source,
    updatedAt: row?.updatedAt ?? null,
  };
}

export const GET = handler(async () => {
  await requireRole("ADMIN");
  return json({ data: await view() });
});

export const PUT = handler(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseBody(req, putSchema);
  const provider = AI_PROVIDERS.find((p) => p.id === input.provider)!;
  if (provider.kind !== "skills" && provider.editableBaseUrl && !input.baseUrl && !provider.baseUrl) {
    throw new ApiError(422, "Point d'accès requis pour ce fournisseur", "base_url_required");
  }
  const data = {
    enabled: input.enabled,
    provider: input.provider,
    // Claude Skills : pas de modèle (chaque tâche est un skill).
    model: provider.kind === "skills" ? null : input.model || null,
    fastModel: provider.kind === "skills" ? null : input.fastModel || null,
    baseUrl: provider.kind === "skills" ? null : input.baseUrl || null,
    updatedBy: session.sub,
    ...(input.apiKey === undefined ? {} : { apiKeyEnc: input.apiKey === null ? null : encrypt(input.apiKey) }),
  };
  await prisma.aiConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID, ...data }, update: data });
  invalidateAiConfig();
  await audit({
    userId: session.sub,
    action: "ai.config.update",
    entityType: "AiConfig",
    entityId: CONFIG_ID,
    ip: clientIp(req),
    diff: { provider: data.provider, enabled: data.enabled, model: data.model, apiKeyChanged: input.apiKey !== undefined },
  });
  return json({ data: await view() });
});
