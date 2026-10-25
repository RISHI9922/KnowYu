import "server-only";

// Gemini pricing per 1M tokens as of the provider migration. Verify current
// prices at https://ai.google.dev/pricing before deploying.
const EMBEDDING_INPUT_PRICE_PER_M = 0.15;
const GEMINI_FLASH_INPUT_PRICE_PER_M = 0.30;
const GEMINI_FLASH_OUTPUT_PRICE_PER_M = 2.50;

export function estimateEmbeddingCost(inputTokens: number): number {
  return (inputTokens / 1_000_000) * EMBEDDING_INPUT_PRICE_PER_M;
}

export function estimateChatCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * GEMINI_FLASH_INPUT_PRICE_PER_M
    + (outputTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_PRICE_PER_M
  );
}

export const DAILY_BUDGET_USD = 1.0;
