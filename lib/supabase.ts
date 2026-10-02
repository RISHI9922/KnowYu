import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "./env";
import { AppError } from "./errors";
import { documentMatchRowSchema } from "./schemas";
import type { DocumentMatch } from "./types";

const DATABASE_TIMEOUT_MS = 5_000;

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
} as const;

export const supabaseService = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  clientOptions,
);

export async function matchDocuments(
  queryEmbedding: ReadonlyArray<number>,
  signal?: AbortSignal,
): Promise<ReadonlyArray<DocumentMatch>> {
  const controller = new AbortController();
  let didTimeout = false;

  const abortFromCaller = (): void => {
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, DATABASE_TIMEOUT_MS);

  try {
    const { data, error } = await supabaseService
      .rpc("match_documents", {
        query_embedding: [...queryEmbedding],
        match_threshold: 0.7,
        match_count: 5,
      })
      .abortSignal(controller.signal);

    if (error !== null) {
      throw new AppError("INTERNAL_ERROR", { cause: error });
    }

    const rows = documentMatchRowSchema.array().parse(data);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      source: row.source,
      page: row.page,
      chunkIndex: row.chunk_index,
      similarity: row.similarity,
    }));
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    // Caller-initiated abort: propagate unchanged, do not label as error.
    if (signal?.aborted && !didTimeout) {
      throw cause;
    }

    throw new AppError(didTimeout ? "DB_TIMEOUT" : "INTERNAL_ERROR", {
      cause,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
