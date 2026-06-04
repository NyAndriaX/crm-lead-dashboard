/** Libellés français des features OpenAI pour l'UI. */
export const OPENAI_FEATURE_LABELS: Record<string, string> = {
  config_test: "Test de connexion",
  email_variants: "Variantes d'email",
  lead_brief: "Brief lead",
  reply_categorize: "Catégorisation réponses",
  email_personalize: "Personnalisation email",
  sequence_personalize: "Personnalisation relances",
  auto_reply: "Réponse automatique",
};

export function openAiFeatureLabel(feature: string): string {
  return OPENAI_FEATURE_LABELS[feature] ?? feature;
}
