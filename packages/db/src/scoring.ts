/**
 * Score de lead 0–100 (CRM-019), partagé par l'API web et les tâches de fond.
 * Dérivé de : complétude du profil, potentiel estimé par Claude (adéquation à la cible
 * ou brief de qualification), interactions email et statut commercial.
 * Poids surchargeables par l'administration (table `scoringConfig`, id « default »).
 */
import type { Lead, LeadStatus, PrismaClient } from "@prisma/client";

export interface ScoringWeights {
  hasEmail: number;
  hasPhone: number;
  hasCompany: number;
  hasWebsite: number;
  hasSector: number;
  hasLocation: number; // ville ou pays
  enriched: number; // bloc enrichissement présent
  aiPotential: number; // pondère le potentiel IA 0-100 (points max)
  perOpen: number; // par email ouvert (plafonné)
  maxOpens: number;
  perClick: number; // par clic (plafonné)
  maxClicks: number;
  replied: number; // a répondu au moins une fois
  statusBonus: Partial<Record<LeadStatus, number>>;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  hasEmail: 12,
  hasPhone: 8,
  hasCompany: 8,
  hasWebsite: 4,
  hasSector: 4,
  hasLocation: 4,
  enriched: 10,
  aiPotential: 30,
  perOpen: 4,
  maxOpens: 12,
  perClick: 6,
  maxClicks: 18,
  replied: 20,
  statusBonus: { CONTACTE: 5, QUALIFIE: 12, EN_DISCUSSION: 18, CONVERTI: 25, PERDU: -10 },
};

export interface ScoringSignals {
  opens: number;
  clicks: number;
  hasReplied: boolean;
}

/** Potentiel 0-100 estimé par Claude : adéquation à la cible (scraping) sinon score du brief. */
export function aiPotentialOf(enrichment: unknown): number | null {
  const e = (enrichment ?? {}) as { siteAnalysis?: { fitScore?: unknown }; aiBrief?: { score?: unknown; source?: unknown } };
  const fit = Number(e.siteAnalysis?.fitScore);
  if (Number.isFinite(fit)) return Math.max(0, Math.min(100, fit));
  const brief = Number(e.aiBrief?.score);
  if (Number.isFinite(brief) && e.aiBrief?.source !== "fallback") return Math.max(0, Math.min(100, brief));
  return null;
}

export function computeLeadScore(
  lead: Pick<Lead, "emailHash" | "phoneEnc" | "company" | "website" | "sector" | "city" | "country" | "enrichment" | "status" | "lastReplyAt">,
  signals: ScoringSignals = { opens: 0, clicks: 0, hasReplied: false },
  w: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): number {
  let s = 0;
  if (lead.emailHash) s += w.hasEmail;
  if (lead.phoneEnc) s += w.hasPhone;
  if (lead.company) s += w.hasCompany;
  if (lead.website) s += w.hasWebsite;
  if (lead.sector) s += w.hasSector;
  if (lead.city || lead.country) s += w.hasLocation;
  if (lead.enrichment) s += w.enriched;
  const potential = aiPotentialOf(lead.enrichment);
  if (potential != null) s += (potential / 100) * (w.aiPotential ?? DEFAULT_SCORING_WEIGHTS.aiPotential);
  s += Math.min(w.maxOpens, signals.opens * w.perOpen);
  s += Math.min(w.maxClicks, signals.clicks * w.perClick);
  if (signals.hasReplied || lead.lastReplyAt) s += w.replied;
  s += w.statusBonus[lead.status] ?? 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Poids configurés par l'administration, sinon valeurs par défaut. */
export async function loadScoringWeights(db: PrismaClient): Promise<ScoringWeights> {
  try {
    const config = await db.scoringConfig.findUnique({ where: { id: "default" } });
    if (config?.weights) return { ...DEFAULT_SCORING_WEIGHTS, ...(config.weights as Partial<ScoringWeights>) };
  } catch {
    /* table absente ou base indisponible : poids par défaut */
  }
  return DEFAULT_SCORING_WEIGHTS;
}

/** Recalcule (interactions email comprises) et persiste le score d'un lead. */
export async function recomputeLeadScore(db: PrismaClient, leadId: string, weights?: ScoringWeights): Promise<number | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;
  const groups = await db.emailEvent.groupBy({ by: ["eventType"], where: { leadId }, _count: { _all: true } });
  const n = (t: string) => groups.find((g) => String(g.eventType) === t)?._count._all ?? 0;
  const score = computeLeadScore(lead, { opens: n("OPEN"), clicks: n("CLICK"), hasReplied: n("REPLIED") > 0 }, weights ?? (await loadScoringWeights(db)));
  if (score !== lead.score) await db.lead.update({ where: { id: leadId }, data: { score } });
  return score;
}
