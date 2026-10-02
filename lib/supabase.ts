import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "./env";
import { AppError } from "./errors";
import { documentMatchRowSchema } from "./schemas";
import type { DocumentMatch } from "./types";

const DATABASE_TIMEOUT_MS = 5_000;

export interface DocumentChunkInput {
  content: string;
  embedding: ReadonlyArray<number>;
  page: number | null;
  chunkIndex: number;
}

export interface IdempotencyRecord {
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: string;
}

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
      throw new AppError("INTERNAL_ERROR", { cause: error, status: 503 });
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

export async function checkDatabaseHealth(
  signal?: AbortSignal,
): Promise<void> {
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
    const { error } = await supabaseService
      .from("documents")
      .select("id")
      .limit(1)
      .abortSignal(controller.signal);

    if (error !== null) {
      throw new AppError("INTERNAL_ERROR", { cause: error, status: 503 });
    }
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    if (signal?.aborted && !didTimeout) {
      throw cause;
    }

    if (didTimeout) {
      throw new AppError("DB_TIMEOUT", { cause });
    }

    throw new AppError("INTERNAL_ERROR", { cause, status: 503 });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function replaceDocumentChunks(
  source: string,
  chunks: ReadonlyArray<DocumentChunkInput>,
  signal?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromCaller = (): void => controller.abort(signal?.reason);

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
    const { data, error } = await supabaseService.rpc(
      "replace_document_chunks",
      {
        source_name: source,
        document_chunks: chunks.map((chunk) => ({
          content: chunk.content,
          embedding: [...chunk.embedding],
          page: chunk.page,
          chunk_index: chunk.chunkIndex,
        })),
      },
    ).abortSignal(controller.signal);

    if (error !== null || data !== chunks.length) {
      throw new AppError("INTERNAL_ERROR", {
        cause: error ?? new Error("Unexpected inserted chunk count."),
        status: 503,
      });
    }
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    if (signal?.aborted && !didTimeout) {
      throw cause;
    }

    throw new AppError(didTimeout ? "DB_TIMEOUT" : "INTERNAL_ERROR", {
      cause,
      status: 503,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function getIdempotencyRecord(
  key: string,
): Promise<IdempotencyRecord | null> {
  const signal = AbortSignal.timeout(DATABASE_TIMEOUT_MS);
  let data;
  let error;

  try {
    const result = await supabaseService
      .from("idempotency_keys")
      .select("request_hash,status_code,response_body,created_at")
      .eq("key", key)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .maybeSingle()
      .abortSignal(signal);
    data = result.data;
    error = result.error;
  } catch (cause) {
    throw new AppError(signal.aborted ? "DB_TIMEOUT" : "INTERNAL_ERROR", {
      cause,
      status: 503,
    });
  }

  if (error !== null) {
    throw new AppError("INTERNAL_ERROR", { cause: error, status: 503 });
  }

  if (data === null) {
    return null;
  }

  return {
    requestHash: data.request_hash,
    statusCode: data.status_code,
    responseBody: data.response_body,
    createdAt: data.created_at,
  };
}

export async function storeIdempotencyRecord(
  key: string,
  requestHash: string,
  statusCode: number,
  responseBody: unknown,
): Promise<void> {
  const signal = AbortSignal.timeout(DATABASE_TIMEOUT_MS);
  let error;

  try {
    const result = await supabaseService.from("idempotency_keys").upsert({
      key,
      request_hash: requestHash,
      status_code: statusCode,
      response_body: responseBody,
      created_at: new Date().toISOString(),
    }).abortSignal(signal);
    error = result.error;
  } catch (cause) {
    throw new AppError(signal.aborted ? "DB_TIMEOUT" : "INTERNAL_ERROR", {
      cause,
      status: 503,
    });
  }

  if (error !== null) {
    throw new AppError("INTERNAL_ERROR", { cause: error, status: 503 });
  }
}
