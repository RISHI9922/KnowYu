import "server-only";

import OpenAI from "openai";

import { env } from "./env";
import { AppError } from "./errors";
import { llmAnswerSchema, type LlmAnswer } from "./schemas";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";
const EMBEDDING_DIMENSIONS = 1_536;
const EMBEDDING_BATCH_SIZE = 100;
const EMBEDDING_TIMEOUT_MS = 10_000;
const LLM_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 500;

export const openai = new OpenAI({
  apiKey: env.openAiApiKey,
});

interface TimedSignal {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
}

function createTimedSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): TimedSignal {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = (): void => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export async function createEmbeddings(
  input: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<ReadonlyArray<number>>> {
  if (input.length === 0) {
    return [];
  }

  const timedSignal = createTimedSignal(signal, EMBEDDING_TIMEOUT_MS);

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [...input],
      encoding_format: "float",
    }, { signal: timedSignal.signal });

    const embeddings = [...response.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (
      embeddings.length !== input.length
      || embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSIONS)
    ) {
      throw new AppError("EMBEDDING_FAILED");
    }

    return embeddings;
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    if (signal?.aborted && !timedSignal.didTimeout()) {
      throw cause;
    }

    throw new AppError("EMBEDDING_FAILED", { cause });
  } finally {
    timedSignal.cleanup();
  }
}

export async function createEmbeddingsBatched(
  input: ReadonlyArray<string>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<ReadonlyArray<number>>> {
  const embeddings: Array<ReadonlyArray<number>> = [];

  for (let index = 0; index < input.length; index += EMBEDDING_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = input.slice(index, index + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await createEmbeddings(batch, signal);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

export async function generateAnswer(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<LlmAnswer> {
  const timedSignal = createTimedSignal(signal, LLM_TIMEOUT_MS);

  try {
    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grounded_answer",
          strict: true,
          schema: {
            type: "object",
            properties: {
              answer: {
                type: "string",
                minLength: 1,
                maxLength: 4_000,
              },
              citations: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string", minLength: 1 },
                    page: {
                      anyOf: [
                        { type: "integer", minimum: 1 },
                        { type: "null" },
                      ],
                    },
                  },
                  required: ["source", "page"],
                  additionalProperties: false,
                },
              },
            },
            required: ["answer", "citations"],
            additionalProperties: false,
          },
        },
      },
    }, { signal: timedSignal.signal });

    const content = response.choices[0]?.message.content ?? "";

    if (!content) {
      throw new AppError("LLM_FAILED");
    }

    let parsedAnswer: unknown;

    try {
      parsedAnswer = JSON.parse(content);
    } catch (cause) {
      throw new AppError("LLM_FAILED", { cause });
    }

    return llmAnswerSchema.parse(parsedAnswer);
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    if (signal?.aborted && !timedSignal.didTimeout()) {
      throw cause;
    }

    throw new AppError(
      timedSignal.didTimeout() ? "LLM_TIMEOUT" : "LLM_FAILED",
      { cause },
    );
  } finally {
    timedSignal.cleanup();
  }
}
