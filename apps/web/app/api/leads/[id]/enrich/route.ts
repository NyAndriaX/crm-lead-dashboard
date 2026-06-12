/**
 * POST /api/leads/:id/enrich — enrichissement d'un lead (E-01 → E-09).
 *
 * Body optionnel : { providers?: ("email"|"emailVerify"|"company"|"linkedin"|
 * "news"|"social")[] }. Par défaut tous les providers.
 *
 * Synchrone (les providers stub/gratuits sont rapides : DNS MX + RSS).
 */
import { z } from "zod";
import { handler, json, parseBody, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { enrichLeadById, ALL_PROVIDERS, type EnrichProvider } from "@/lib/services/enrichment";
import { toScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  providers: z
    .array(z.enum(["email", "emailVerify", "company", "linkedin", "news", "social"]))
    .min(1)
    .optional(),
}).optional();

export const POST = handler<Ctx>(async (req, { params }) => {
  const session = await requirePermission("leads:write");
  const { id: rawId } = await params;
  const id = z.string().min(1).parse(rawId);

  let providers: EnrichProvider[] = ALL_PROVIDERS;
  try {
    const body = await parseBody(req, bodySchema);
    if (body?.providers) providers = body.providers;
  } catch {
    // body vide → tous les providers
  }

  try {
    const result = await enrichLeadById(id, providers, toScope(session));
    await audit({
      userId: session.sub,
      action: "lead.enrich",
      entityType: "Lead",
      entityId: id,
      ip: clientIp(req),
      diff: { providers: result.ran, emailWritten: result.emailWritten },
    });
    return json({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(400, msg, "enrich_failed");
  }
});
