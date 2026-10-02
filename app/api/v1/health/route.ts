import { NextRequest, NextResponse } from "next/server";

import { AppError, toHttpStatus, toPublicError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import {
  healthLimiter,
  rateLimitHeaders,
  type RateLimitMetadata,
} from "../../../../lib/rate-limit";
import { getClientIp, getRequestId } from "../../../../lib/request";
import { checkDatabaseHealth } from "../../../../lib/supabase";
import type { ApiFailure, ApiSuccess } from "../../../../lib/types";

export const runtime = "nodejs";

interface HealthData {
  status: "ok";
  version: string;
  checks: {
    database: "ok";
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const meta = {
    requestId,
    timestamp: new Date().toISOString(),
  };
  const ip = getClientIp(request);
  let rateLimit: RateLimitMetadata;

  try {
    rateLimit = await healthLimiter.limit(ip);
  } catch (cause) {
    logger.warn({
      requestId,
      operation: "health_rate_limit",
      status: "fail_open",
      cause: cause instanceof Error ? cause.name : "UnknownError",
    });
    rateLimit = {
      success: true,
      limit: 60,
      remaining: 60,
      reset: Date.now() + 60_000,
    };
  }

  const headers = {
    ...rateLimitHeaders(rateLimit),
    "X-Request-ID": requestId,
  };

  try {
    if (!rateLimit.success) {
      const cause = new AppError("RATE_LIMITED");
      const body: ApiFailure = {
        data: null,
        error: toPublicError(cause),
        meta,
      };

      return NextResponse.json(body, { status: cause.status, headers });
    }

    await checkDatabaseHealth(request.signal);

    const body: ApiSuccess<HealthData> = {
      data: {
        status: "ok",
        version: "1.0.0",
        checks: { database: "ok" },
      },
      error: null,
      meta,
    };

    logger.info({
      requestId,
      operation: "health_check",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(body, { status: 200, headers });
  } catch (cause) {
    logger.error({
      requestId,
      operation: "health_check",
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
