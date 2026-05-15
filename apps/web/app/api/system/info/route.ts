/**
 * GET /api/system/info — agrège l'état système pour l'onglet Paramètres →
 * Système : organisation courante (T-02), santé (P-03), uptime.
 *
 * La capacité détaillée (P-02) a son propre endpoint /api/system/capacity.
 */
import { handler, json, requirePermission } from "@/lib/api";
import { currentOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requirePermission("settings:manage");
  const org = await currentOrganization();
  return json({
    data: {
      organization: org,
      multiTenant: {
        enabled: false,
        mode: "single-tenant",
        note: "Le CRM tourne en single-tenant (1 instance = 1 organisation). L'isolation multi-tenant est une évolution phase 2 (scaffold posé : modèle Organization + helper).",
      },
    },
  });
});
