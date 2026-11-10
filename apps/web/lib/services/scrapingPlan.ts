/**
 * Assistant de mission de scraping — skill Claude `crm-scraping-plan`.
 *
 * Transforme une description de cible en langage naturel en plan exploitable :
 * requêtes Google Maps complémentaires (métier × zone), profil cible pour le score
 * d'adéquation (skill crm-lead-analysis côté scraper), exclusions, volume et seuil.
 */
import { isAiEnabled, runSkill, scrapingPlanSchema } from "@crm/ai";
import { ApiError } from "@/lib/api";

export type ScrapingPlan = {
  name: string;
  queries: string[];
  targetProfile: string;
  exclusions: string[];
  suggestedLimit: number;
  minFitScore: number;
  rationale: string;
};

type PlanOut = {
  name: string;
  queries: string[];
  target_profile: string;
  exclusions: string[];
  suggested_limit: number;
  min_fit_score: number;
  rationale: string;
};

export async function generateScrapingPlan(input: {
  brief: string;
  country: string;
  locale: string;
}): Promise<ScrapingPlan> {
  if (!(await isAiEnabled())) {
    throw new ApiError(
      503,
      "Assistant IA indisponible : aucun fournisseur d'IA n'est configuré (Configuration › Intelligence artificielle).",
      "ai_disabled",
    );
  }
  const out = await runSkill<PlanOut>({
    skill: "crm-scraping-plan",
    schema: scrapingPlanSchema,
    input,
  });
  if (!out) throw new ApiError(502, "Le plan IA n'a pas pu être généré. Réessayez.", "ai_upstream_error");

  const queries = [...new Set(out.queries.map((q) => q.trim()).filter((q) => q.length > 1))].slice(0, 8);
  const exclusions = out.exclusions.map((e) => e.trim()).filter(Boolean);
  return {
    name: out.name.trim(),
    queries,
    // Les exclusions font partie du profil transmis au scoring.
    targetProfile: exclusions.length
      ? `${out.target_profile.trim()} Exclure : ${exclusions.join(", ")}.`
      : out.target_profile.trim(),
    exclusions,
    suggestedLimit: Math.max(10, Math.min(120, out.suggested_limit)),
    minFitScore: Math.max(0, Math.min(100, out.min_fit_score)),
    rationale: out.rationale.trim(),
  };
}
