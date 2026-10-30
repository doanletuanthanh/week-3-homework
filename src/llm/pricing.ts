/**
 * USD per 1M tokens, standard tier. Source: plans/reports/researcher-261003-1707-langgraph-llm-stack.md §3
 * (medium confidence); the three gpt-6 prices were confirmed in the OpenAI console on 2026-10-30. Confirm each price
 * in the vendor console before pointing a role at the model.
 */
type Price = { input: number; cachedInput: number; output: number };

const PRICES: Record<string, Price> = {
  "gemini-3.8-flash": { input: 0.75, cachedInput: 0.075, output: 3.75 },
  "gemini-3.5-flash": { input: 1.5, cachedInput: 0.15, output: 9 },
  "gemini-3.5-flash-lite": { input: 0.3, cachedInput: 0.03, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, cachedInput: 0.025, output: 1.5 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6.1-terra": { input: 1, cachedInput: 0.05, output: 5 },
  "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
};

export type TokenUsage = {
  inputTokens: number;
  /** Part of `inputTokens` served from the provider's prompt cache. */
  cachedInputTokens: number;
  /** Includes reasoning tokens: both providers bill them as output. */
  outputTokens: number;
  reasoningTokens: number;
};

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

export function hasPrice(model: string): boolean {
  return model in PRICES;
}

/**
 * `batch`: the call went through the provider's batch API, billed at half the standard price for
 * input, cached input and output alike (https://ai.google.dev/gemini-api/docs/batch-mode).
 */
export type PriceTier = "standard" | "batch";
const TIER_FACTOR: Record<PriceTier, number> = { standard: 1, batch: 0.5 };

export function costUsd(model: string, usage: TokenUsage, tier: PriceTier = "standard"): number {
  const price = PRICES[model];
  if (!price) throw new Error(`no price configured for model "${model}"`);
  const freshInput = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  return (
    ((freshInput * price.input + usage.cachedInputTokens * price.cachedInput + usage.outputTokens * price.output) / 1_000_000) *
    TIER_FACTOR[tier]
  );
}
