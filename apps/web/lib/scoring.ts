/**
 * Lead scoring engine — CRM-019. La formule vit dans `@crm/db` (partagée avec les tâches de fond) ;
 * ici : surcharge éventuelle des poids par `SCORING_WEIGHTS` (JSON en env) et lecture de la config admin.
 */
import {
  DEFAULT_SCORING_WEIGHTS,
  computeLeadScore,
  loadScoringWeights,
  prisma,
  type Lead,
  type ScoringSignals,
  type ScoringWeights,
} from "@crm/db";

export type { ScoringSignals, ScoringWeights };
export const DEFAULT_WEIGHTS = DEFAULT_SCORING_WEIGHTS;

export function getWeights(): ScoringWeights {
  const raw = process.env.SCORING_WEIGHTS;
  if (!raw) return DEFAULT_WEIGHTS;
  try {
    return { ...DEFAULT_WEIGHTS, ...(JSON.parse(raw) as Partial<ScoringWeights>) };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

/** Poids configurés en base (ScoringConfig), avec repli sur getWeights(). */
export async function getWeightsFromDb(): Promise<ScoringWeights> {
  const w = await loadScoringWeights(prisma);
  return w === DEFAULT_SCORING_WEIGHTS ? getWeights() : w;
}

/** Calcule le score d'un lead (0–100). */
export function computeScore(
  lead: Pick<Lead, "emailHash" | "phoneEnc" | "company" | "website" | "sector" | "city" | "country" | "enrichment" | "status" | "lastReplyAt">,
  signals: ScoringSignals = { opens: 0, clicks: 0, hasReplied: false },
  w: ScoringWeights = getWeights(),
): number {
  return computeLeadScore(lead, signals, w);
}
