/**
 * POST /api/leads/enrich-bulk — enrichissement en masse (E-08).
 *
 * Traite UN lot (≤ 25 leads) par requête : l'UI découpe la sélection en
 * lots et enchaîne les appels pour piloter une barre de progression réelle
 * sans bloquer une seule requête HTTP trop longtemps.
 *
 * Body : { ids: string[], providers?: EnrichProvider[], final?: boolean,
 *          totalSelected?: number }
 *  - `final: true` (dernier lot) → crée une Notification "enrichissement terminé".
 */
import { z } from "zod";
import { prisma } from "@crm/db";
import { handler, json, parseBody, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { enrichLeadById } from "@/lib/services/enrichment";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(25),
  providers: z
    .array(z.enum(["email", "emailVerify", "company", "linkedin", "news", "social"]))
    .min(1)
    .optional(),
  final: z.boolean().optional(),
  totalSelected: z.number().int().positive().optional(),
});

export const POST = handler(async (req) => {
  const session = await requirePermission("leads:write");
  const input = await parseBody(req, bodySchema);

  const results: { leadId: string; ok: boolean; ran?: string[]; error?: string }[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const id of input.ids) {
    try {
      const r = await enrichLeadById(id, input.providers);
      results.push({ leadId: id, ok: true, ran: r.ran });
      succeeded++;
    } catch (e) {
      results.push({ leadId: id, ok: false, error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }

  if (input.final) {
    await prisma.notification.create({
      data: {
        userId: session.sub,
        type: "enrichment_done",
        title: "Enrichissement terminé",
        body: `${input.totalSelected ?? input.ids.length} lead(s) traité(s).`,
        link: "/leads",
      },
    });
    await audit({
      userId: session.sub,
      action: "lead.bulk.enrich",
      entityType: "Lead",
      ip: clientIp(req),
      diff: { totalSelected: input.totalSelected ?? input.ids.length } as object,
    });
  }

  return json({ data: { results, succeeded, failed } });
});
