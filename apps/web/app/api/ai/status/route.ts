/** GET /api/ai/status — fournisseur d'IA actif, pour l'affichage (badge de l'en-tête, libellés). */
import { getAiConfig, isAiEnabled } from "@crm/ai";
import { handler, json, requireSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireSession();
  const c = await getAiConfig();
  return json({ data: { enabled: await isAiEnabled(), provider: c.provider.id, label: c.provider.label, vendor: c.provider.vendor } });
});
