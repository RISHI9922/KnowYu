import "server-only";

import OpenAI from "openai";

import { env } from "./env";
import { AppError } from "./errors";
import { llmAnswerSchema, type LlmAnswer } from "./schemas";

const EMBEDDING_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-3.5-flash-lite";
const EMBEDDING_DIMENSIONS = 1_536;
const EMBEDDING_TIMEOUT_MS = 10_000;
const LLM_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 500;
const EMBEDDING_BATCH_SIZE = 100;

// Gemini provides an OpenAI-compatible endpoint.
// See: https://ai.google.dev/gemini-api/docs/openai
export const openai = new OpenAI({
  apiKey: env.geminiApiKey,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
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
    // Gemini defaults to 3072-dimensional embeddings. Request 1536 so the
    // existing vector(1536) database column remains compatible.
    const response = await openai.embeddings.create(
      {
        model: EMBEDDING_MODEL,
        input: [...input],
        dimensions: EMBEDDING_DIMENSIONS,
        encoding_format: "float",
      },
      { signal: timedSignal.signal },
    );

    const embeddings = [...response.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    if (
      embeddings.length !== input.length
      || embeddings.some((embedding) => embedding.length !== EMBEDDING_DIMENSIONS)
    ) {
      throw new AppError("EMBEDDING_FAILED", {
        message: `Gemini returned ${embeddings[0]?.length ?? 0}-dimensional embeddings; expected ${EMBEDDING_DIMENSIONS}.`,
      });
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
  const result: Array<ReadonlyArray<number>> = [];

  for (let index = 0; index < input.length; index += EMBEDDING_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = input.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddings = await createEmbeddings(batch, signal);
    result.push(...embeddings);
  }

  return result;
}

export interface GeneratedAnswer {
  answer: LlmAnswer;
  inputTokens: number;
  outputTokens: number;
}

export async function generateAnswer(
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<GeneratedAnswer> {
  const timedSignal = createTimedSignal(signal, LLM_TIMEOUT_MS);

  try {
    // Gemini's OpenAI-compatible endpoint supports JSON object mode. Zod
    // performs strict response-shape validation after parsing.
    const response = await openai.chat.completions.create(
      {
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { signal: timedSignal.signal },
    );

    const rawContent = response.choices[0]?.message.content ?? "";

    if (rawContent.length === 0) {
      throw new AppError("LLM_FAILED", {
        message: "Gemini returned an empty response.",
      });
    }

    let parsedAnswer: unknown;

    try {
      parsedAnswer = JSON.parse(rawContent);
    } catch (cause) {
      throw new AppError("LLM_FAILED", {
        message: "Gemini returned malformed JSON.",
        cause,
      });
    }

    const validated = llmAnswerSchema.parse(parsedAnswer);

    return {
      answer: validated,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
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
