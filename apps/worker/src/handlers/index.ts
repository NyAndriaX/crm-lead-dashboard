/**
 * Registre des handlers de jobs **@hokify/agenda**, indexés par le nom du job.
 * (Le worker reste découplé de l'app web : il n'importe que `@crm/db` + `@crm/queue`.)
 *
 * Implémentés :
 *  - "noop"           : témoin de bout en bout
 *  - "scoring"        : recalcul du lead scoring (batch — CRM-019/066)
 *  - "import-process" : traitement CSV/XLSX (CRM-021 → CRM-027)
 *
 * Placeholders :
 *  - "sequences-stop" : arrêt des séquences de relance d'un lead (CRM-041/047)
 *
 * Notifications :
 *  - "notification"   : in-app + email (payload NotifyUserInput complet)
 *
 * Emailing / campagnes :
 *  - "campaign-send"  : envoi par lots des campagnes emailing — voir `campaignSend.ts`
 */
import { prisma, notifyUser, processImportJob, type NotifyUserInput } from "@crm/db";
import type { WorkerJobContext, WorkerJobHandler } from "@crm/queue";
import { runCampaignSend } from "../campaignSend";
import { runImapSync } from "../imapSync";
import { runSequenceTick } from "../sequenceTick";
import { runScraping, runScrapingScheduler } from "../scrapingRun";

export type JobHandler = WorkerJobHandler;

// ── Scoring weights (miroir de apps/web/lib/scoring.ts) ──────────────────────
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

// ── Import processor (CRM-021 → CRM-027) ────────────────────────────────────

interface ImportPayload {
  importJobId: string;
  skipDuplicates?: boolean;
  defaultSource?: string;
  defaultTags?: string[] | null;
}

async function processImport(ctx: WorkerJobContext): Promise<unknown> {
  const payload = (ctx.payload as unknown as ImportPayload) ?? ({} as ImportPayload);
  if (!payload.importJobId) return { error: "importJobId manquant" };
  return processImportJob({
    importJobId: payload.importJobId,
    skipDuplicates: payload.skipDuplicates,
    defaultSource: payload.defaultSource,
    defaultTags: payload.defaultTags,
  });
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const handlers: Record<string, JobHandler> = {
  noop: async (ctx) => ({ ok: true, echoed: ctx.payload ?? null, at: new Date().toISOString() }),

  scoring: async (ctx) => {
    const payload = (ctx.payload ?? {}) as { leadId?: string; leadIds?: string[] };
    const ids = payload.leadIds ?? (payload.leadId ? [payload.leadId] : []);
    const results: Record<string, number | null> = {};
    for (const id of ids) results[id] = await scoreLead(id);
    return { scored: ids.length, results };
  },

  "import-process": processImport,

  notification: async (ctx) => {
    const p = (ctx.payload ?? {}) as Partial<NotifyUserInput>;
    if (p.userId && p.type && p.title) {
      const result = await notifyUser({
        userId: p.userId,
        type: p.type,
        title: p.title,
        body: p.body,
        link: p.link,
        skipEmail: p.skipEmail,
      });
      return { ok: true, ...result };
    }
    console.log("[worker] notification job ignoré (payload legacy ou incomplet):", ctx.payload);
    return { ok: true, skipped: true };
  },

  "sequences-stop": async (ctx) => {
    console.log("[worker] sequences-stop (placeholder):", ctx.payload);
    return { ok: true };
  },

  "campaign-send": runCampaignSend,

  "imap-sync": runImapSync,

  "sequence-tick": runSequenceTick,

  "scraping-run": async (ctx) => {
    console.log("[worker] scraping-run — job reçu", ctx.payload);
    return runScraping(ctx);
  },

  "scraping-scheduler": async () => runScrapingScheduler(),
};
