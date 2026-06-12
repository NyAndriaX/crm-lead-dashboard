/**
 * GET /api/rgpd/registry — registre des activités de traitement (article 30).
 *
 * Document statique versionné en code (lib/services/rgpd.ts → DATA_REGISTRY).
 * Mis à jour par les développeurs lorsque le périmètre de traitement change.
 */
import { handler, json, requirePermission } from "@/lib/api";
import { getDataRegistry } from "@/lib/services/rgpd";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("rgpd:manage");
  return json({ data: getDataRegistry() });
});
