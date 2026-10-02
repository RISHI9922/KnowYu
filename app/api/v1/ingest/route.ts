import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { env } from "../../../../lib/env";
import { AppError, toHttpStatus, toPublicError } from "../../../../lib/errors";
import { ingestCorpus } from "../../../../lib/ingestion";
import { logger } from "../../../../lib/logger";
import { ingestLimiter, rateLimitHeaders } from "../../../../lib/rate-limit";
import { getRequestId } from "../../../../lib/request";
import {
  authorizationHeaderSchema,
  idempotencyKeySchema,
  ingestRequestSchema,
  ingestSuccessResponseSchema,
  type IngestSuccessResponse,
} from "../../../../lib/schemas";
import {
  getIdempotencyRecord,
  storeIdempotencyRecord,
} from "../../../../lib/supabase";
import type { ApiFailure } from "../../../../lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 10 * 1_024;
const encoder = new TextEncoder();

function hash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function authenticate(request: NextRequest): string {
  const parsed = authorizationHeaderSchema.safeParse(
    request.headers.get("authorization"),
  );

  if (!parsed.success) {
    throw new AppError("UNAUTHORIZED");
  }

  const token = parsed.data.slice("Bearer ".length);
  const providedHash = hash(token);
  const expectedHash = hash(env.ingestAdminToken);

  if (!timingSafeEqual(providedHash, expectedHash)) {
    throw new AppError("UNAUTHORIZED");
  }

  return providedHash.toString("hex");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const meta = {
    requestId,
    timestamp: new Date().toISOString(),
  };
  let headers: Record<string, string> = { "X-Request-ID": requestId };

  try {
    const adminIdentity = authenticate(request);
    const rateLimit = await ingestLimiter.limit(adminIdentity);
    headers = {
      ...rateLimitHeaders(rateLimit),
      "X-Request-ID": requestId,
    };

    if (!rateLimit.success) {
      throw new AppError("RATE_LIMITED");
    }

    const idempotencyResult = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );

    if (!idempotencyResult.success) {
      throw new AppError(
        request.headers.has("idempotency-key")
          ? "INVALID_INPUT"
          : "MISSING_FIELD",
        {
          message: request.headers.has("idempotency-key")
            ? "Idempotency-Key is invalid."
            : "Idempotency-Key is required.",
        },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new AppError("INVALID_INPUT", {
        message: "Content-Type must be application/json.",
      });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new AppError("INVALID_INPUT", {
        message: "Request body must not exceed 10 KB.",
      });
    }

    const rawBody = await request.text();

    if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new AppError("INVALID_INPUT", {
        message: "Request body must not exceed 10 KB.",
      });
    }

    let json: unknown;

    try {
      json = JSON.parse(rawBody);
    } catch (cause) {
      throw new AppError("INVALID_INPUT", {
        message: "Request body must contain valid JSON.",
        cause,
      });
    }

    const parsed = ingestRequestSchema.safeParse(json);

    if (!parsed.success) {
      throw new AppError("INVALID_INPUT", {
        message: "The ingestion request body must be an empty JSON object.",
      });
    }

    const requestHash = hash(JSON.stringify(parsed.data)).toString("hex");
    const idempotencyKey = idempotencyResult.data;
    const existing = await getIdempotencyRecord(idempotencyKey);

    if (existing !== null) {
      if (existing.requestHash !== requestHash) {
        throw new AppError("INVALID_INPUT", {
          message: "Idempotency-Key was already used for another request.",
          status: 409,
        });
      }

      const stored = ingestSuccessResponseSchema.safeParse(
        existing.responseBody,
      );

      if (!stored.success) {
        throw new AppError("INTERNAL_ERROR");
      }

      return NextResponse.json(stored.data, {
        status: existing.statusCode,
        headers: { ...headers, "Idempotent-Replayed": "true" },
      });
    }

    const result = await ingestCorpus(request.signal);
    const body: IngestSuccessResponse = {
      data: result,
      error: null,
      meta,
    };

    await storeIdempotencyRecord(
      idempotencyKey,
      requestHash,
      201,
      body,
    );

    logger.info({
      requestId,
      operation: "ingest_corpus",
      status: 201,
      durationMs: Date.now() - startedAt,
      documentCount: result.documents,
      chunkCount: result.chunks,
      rejectedFileCount: result.rejected,
    });

    return NextResponse.json(body, { status: 201, headers });
  } catch (cause) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }

    logger.error({
      requestId,
      operation: "ingest_corpus",
      status: toHttpStatus(cause),
      durationMs: Date.now() - startedAt,
      errorCode: cause instanceof AppError ? cause.code : "INTERNAL_ERROR",
      cause: cause instanceof Error ? cause.name : "UnknownError",
    });

    const body: ApiFailure = {
      data: null,
      error: toPublicError(cause),
      meta,
    };

    return NextResponse.json(body, {
      status: toHttpStatus(cause),
      headers,
    });
  }
}
