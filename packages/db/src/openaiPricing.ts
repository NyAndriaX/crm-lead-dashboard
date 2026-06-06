/** Tarifs OpenAI en USD par 1M tokens (input / output) — mettre à jour si les prix évoluent. */
const PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

const DEFAULT_PRICING = { input: 0.15, output: 0.6 };

export function getModelPricing(model?: string | null): { input: number; output: number } {
  if (!model) return DEFAULT_PRICING;
  const key = model.trim().toLowerCase();
  if (PRICING_PER_1M[key]) return PRICING_PER_1M[key];
  for (const [k, v] of Object.entries(PRICING_PER_1M)) {
    if (key.startsWith(k)) return v;
  }
  return DEFAULT_PRICING;
}

export function estimateOpenAiCostUsd(args: {
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
}): number {
  const pricing = getModelPricing(args.model);
  const prompt = Math.max(0, args.promptTokens ?? 0);
  const completion = Math.max(0, args.completionTokens ?? 0);
  const cost = (prompt / 1_000_000) * pricing.input + (completion / 1_000_000) * pricing.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function formatCostUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}
