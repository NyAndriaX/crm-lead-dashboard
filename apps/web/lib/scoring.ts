/**
 * Lead scoring engine — CRM-019. Score 0–100 dérivé de :
 *  - complétude du profil (champs renseignés, enrichissement)
 *  - interactions email (ouvertures, clics, réponses)
 *  - statut commercial
 *
 * Les poids sont configurables (à terme via une UI admin — pour l'instant constantes,
 * surchargables par `SCORING_WEIGHTS` JSON en env).
 */
import type { Lead } from "@crm/db";

export interface ScoringWeights {
  hasEmail: number;
  hasPhone: number;
  hasCompany: number;
  hasWebsite: number;
  hasSector: number;
  hasLocation: number; // city ou country
  enriched: number; // bloc enrichissement présent
  perOpen: number; // par email ouvert (plafonné)
  maxOpens: number;
  perClick: number; // par clic (plafonné)
  maxClicks: number;
  replied: number; // a répondu au moins une fois
  statusBonus: Partial<Record<Lead["status"], number>>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  hasEmail: 12,
  hasPhone: 8,
  hasCompany: 8,
  hasWebsite: 4,
  hasSector: 4,
  hasLocation: 4,
  enriched: 10,
  perOpen: 4,
  maxOpens: 12,
  perClick: 6,
  maxClicks: 18,
  replied: 20,
  statusBonus: { CONTACTE: 5, QUALIFIE: 12, EN_DISCUSSION: 18, CONVERTI: 25, PERDU: -10 },
};

export function getWeights(): ScoringWeights {
  const raw = process.env.SCORING_WEIGHTS;
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    return { ...DEFAULT_WEIGHTS, ...(JSON.parse(raw) as Partial<ScoringWeights>) };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export interface ScoringSignals {
  opens: number;
  clicks: number;
  hasReplied: boolean;
}

/** Calcule le score d'un lead (0–100). `lead` doit inclure les champs de profil + statut. */
export function computeScore(
  lead: Pick<Lead, "emailHash" | "phoneEnc" | "company" | "website" | "sector" | "city" | "country" | "enrichment" | "status" | "lastReplyAt">,
  signals: ScoringSignals = { opens: 0, clicks: 0, hasReplied: false },
  w: ScoringWeights = getWeights(),
): number {
  let s = 0;
  if (lead.emailHash) s += w.hasEmail;
  if (lead.phoneEnc) s += w.hasPhone;
  if (lead.company) s += w.hasCompany;
  if (lead.website) s += w.hasWebsite;
  if (lead.sector) s += w.hasSector;
  if (lead.city || lead.country) s += w.hasLocation;
  if (lead.enrichment) s += w.enriched;
  s += Math.min(w.maxOpens, signals.opens * w.perOpen);
  s += Math.min(w.maxClicks, signals.clicks * w.perClick);
  if (signals.hasReplied || lead.lastReplyAt) s += w.replied;
  s += w.statusBonus[lead.status] ?? 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}
