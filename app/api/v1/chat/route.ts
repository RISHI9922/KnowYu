import { NextRequest, NextResponse } from "next/server";
import type { ZodError } from "zod";

import { AppError, toHttpStatus, toPublicError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { chatLimiter, rateLimitHeaders } from "../../../../lib/rate-limit";
import { getClientIp, getRequestId } from "../../../../lib/request";
import { answerQuestion } from "../../../../lib/retrieval";
import { chatRequestSchema } from "../../../../lib/schemas";
import type {
  ApiErrorDetail,
  ApiFailure,
  ChatStreamEvent,
  Citation,
} from "../../../../lib/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 10 * 1_024;
const TOTAL_TIMEOUT_MS = 45_000;
const REFUSAL_MESSAGE = "I don't know based on the provided documents.";
const encoder = new TextEncoder();

function sse(event: ChatStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function streamResponse(
  answer: string,
  citations: ReadonlyArray<Citation>,
  requestId: string,
  headers: Record<string, string>,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse({
        event: "delta",
        data: { text: answer },
      })));
      controller.enqueue(encoder.encode(sse({
        event: "citations",
        data: { items: citations },
      })));
      controller.enqueue(encoder.encode(sse({
        event: "done",
        data: { requestId },
      })));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function validationDetails(error: ZodError): ReadonlyArray<ApiErrorDetail> {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    reason: issue.code,
  }));
}

export async function POST(request: NextRequest): Promise<Response> {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const meta = {
    requestId,
    timestamp: new Date().toISOString(),
  };
  let headers: Record<string, string> = { "X-Request-ID": requestId };
  const totalController = new AbortController();
  let didTotalTimeout = false;

  const abortFromCaller = (): void => {
    totalController.abort(request.signal.reason);
  };

  if (request.signal.aborted) {
    abortFromCaller();
  } else {
    request.signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  const totalTimeout = setTimeout(() => {
    didTotalTimeout = true;
    totalController.abort();
  }, TOTAL_TIMEOUT_MS);

  try {
    const rateLimit = await chatLimiter.limit(getClientIp(request));
    headers = {
      ...rateLimitHeaders(rateLimit),
      "X-Request-ID": requestId,
    };

    if (!rateLimit.success) {
      throw new AppError("RATE_LIMITED");
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

    // We read the full body then check byte length. Safe on Vercel because the
    // platform caps request bodies at ~4.5 MB. If we ever move off Vercel,
    // replace with a streaming reader that aborts early.
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

    const parsed = chatRequestSchema.safeParse(json);

    if (!parsed.success) {
      const isMissingQuestion = parsed.error.issues.some((issue) => (
        issue.path[0] === "question" && issue.code === "invalid_type"
      ));
      throw new AppError(
        isMissingQuestion ? "MISSING_FIELD" : "INVALID_INPUT",
        {
          message: isMissingQuestion
            ? "The question field is required."
            : "Enter a question between 1 and 2,000 characters.",
          details: validationDetails(parsed.error),
        },
      );
    }

    const result = await answerQuestion(parsed.data.question, {
      requestId,
      signal: totalController.signal,
    });

    logger.info({
      requestId,
      operation: "answer_question",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    return streamResponse(result.answer, result.citations, requestId, headers);
  } catch (cause) {
    if (request.signal.aborted && !didTotalTimeout) {
      // Client disconnected. Nothing to send.
      return new Response(null, { status: 499 });
    }

    const error = didTotalTimeout
      ? new AppError("LLM_TIMEOUT", { cause })
      : cause;

    if (error instanceof AppError && error.code === "NO_RELEVANT_DOCS") {
      return streamResponse(REFUSAL_MESSAGE, [], requestId, headers);
    }

    logger.error({
      requestId,
      operation: "answer_question",
      status: toHttpStatus(error),
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      cause: error instanceof Error ? error.name : "UnknownError",
    });

    const body: ApiFailure = {
      data: null,
      error: toPublicError(error),
      meta,
    };

    return NextResponse.json(body, {
      status: toHttpStatus(error),
      headers,
    });
  } finally {
    clearTimeout(totalTimeout);
    request.signal.removeEventListener("abort", abortFromCaller);
  }
}
