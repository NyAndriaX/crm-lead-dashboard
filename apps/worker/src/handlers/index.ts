/**
 * Registre des handlers de jobs, indexés par `job.type`.
 * (Le worker reste découplé de l'app web : il n'importe que `@crm/db`.)
 *
 * Implémentés ici :
 *  - "noop"          : témoin de bout en bout
 *  - "scoring"       : recalcul du lead scoring (batch — CRM-019/066)
 *
 * Placeholders (handlers réels livrés avec leurs modules) :
 *  - "notification"  : envoi de la notification email (CRM-044)
 *  - "sequences-stop": arrêt des séquences de relance d'un lead (CRM-041/047)
 *  - "email-send" / "imap-sync" / "import-process" : modules L3/L4/L5
 */
import { prisma, type Job } from "@crm/db";

export type JobHandler = (job: Job) => Promise<unknown> | unknown;

// Poids de scoring (miroir simplifié de apps/web/lib/scoring.ts ; à factoriser dans
// un package partagé quand le worker en aura besoin d'autres).
const W = {
  hasEmail: 12, hasPhone: 8, hasCompany: 8, hasWebsite: 4, hasSector: 4, hasLocation: 4, enriched: 10,
  perOpen: 4, maxOpens: 12, perClick: 6, maxClicks: 18, replied: 20,
  statusBonus: { CONTACTE: 5, QUALIFIE: 12, EN_DISCUSSION: 18, CONVERTI: 25, PERDU: -10 } as Record<string, number>,
};

async function scoreLead(leadId: string): Promise<number | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const groups = await prisma.emailEvent.groupBy({ by: ["eventType"], where: { leadId }, _count: { _all: true } });
  const n = (t: string) => groups.find((g) => String(g.eventType) === t)?._count._all ?? 0;
  let s = 0;
  if (lead.emailHash) s += W.hasEmail;
  if (lead.phoneEnc) s += W.hasPhone;
  if (lead.company) s += W.hasCompany;
  if (lead.website) s += W.hasWebsite;
  if (lead.sector) s += W.hasSector;
  if (lead.city || lead.country) s += W.hasLocation;
  if (lead.enrichment) s += W.enriched;
  s += Math.min(W.maxOpens, n("OPEN") * W.perOpen);
  s += Math.min(W.maxClicks, n("CLICK") * W.perClick);
  if (n("REPLIED") > 0 || lead.lastReplyAt) s += W.replied;
  s += W.statusBonus[lead.status] ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(s)));
  if (score !== lead.score) await prisma.lead.update({ where: { id: leadId }, data: { score } });
  return score;
}

export const handlers: Record<string, JobHandler> = {
  noop: async (job) => ({ ok: true, echoed: job.payload ?? null, at: new Date().toISOString() }),

  scoring: async (job) => {
    const payload = (job.payload ?? {}) as { leadId?: string; leadIds?: string[] };
    const ids = payload.leadIds ?? (payload.leadId ? [payload.leadId] : []);
    const results: Record<string, number | null> = {};
    for (const id of ids) results[id] = await scoreLead(id);
    return { scored: ids.length, results };
  },

  notification: async (job) => {
    // TODO (CRM-044) : envoyer l'email de notification ; la notif in-app est déjà créée côté web.
    console.log("[worker] notification (placeholder):", job.payload);
    return { ok: true, delivered: "in-app only" };
  },

  "sequences-stop": async (job) => {
    // TODO (CRM-041/047) : passer les sequenceLeads du lead en status='stopped'.
    console.log("[worker] sequences-stop (placeholder):", job.payload);
    return { ok: true };
  },
};
