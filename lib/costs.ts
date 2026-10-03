import "server-only";

const EMBEDDING_INPUT_PRICE_PER_M = 0.02;
const GPT_4O_MINI_INPUT_PRICE_PER_M = 0.15;
const GPT_4O_MINI_OUTPUT_PRICE_PER_M = 0.6;

export function estimateEmbeddingCost(inputTokens: number): number {
  return (inputTokens / 1_000_000) * EMBEDDING_INPUT_PRICE_PER_M;
}

export function estimateChatCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * GPT_4O_MINI_INPUT_PRICE_PER_M
    + (outputTokens / 1_000_000) * GPT_4O_MINI_OUTPUT_PRICE_PER_M
  );
}

export const DAILY_BUDGET_USD = 1.0;
