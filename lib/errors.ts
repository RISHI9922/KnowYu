import type {
  ApiError,
  ApiErrorCode,
  ApiErrorDetail,
} from "./types";

const defaultMessages: Record<ApiErrorCode, string> = {
  INVALID_INPUT: "The request is invalid.",
  MISSING_FIELD: "A required field is missing.",
  RATE_LIMITED: "Too many requests. Try again later.",
  NOT_FOUND: "The requested resource was not found.",
  UNAUTHORIZED: "Authentication is required.",
  INTERNAL_ERROR: "Something went wrong.",
  LLM_TIMEOUT: "The answer took too long to generate. Try again.",
  LLM_FAILED: "The answer could not be generated. Try again.",
  EMBEDDING_FAILED: "The question could not be processed. Try again.",
  DB_TIMEOUT: "The document database took too long to respond. Try again.",
  NO_RELEVANT_DOCS: "I don't know based on the provided documents.",
  DOCUMENT_TOO_LARGE: "The document is too large to ingest.",
};

const defaultStatuses: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  MISSING_FIELD: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
  LLM_TIMEOUT: 503,
  LLM_FAILED: 503,
  EMBEDDING_FAILED: 503,
  DB_TIMEOUT: 503,
  NO_RELEVANT_DOCS: 422,
  DOCUMENT_TOO_LARGE: 422,
};

interface AppErrorOptions {
  message?: string;
  status?: number;
  details?: ReadonlyArray<ApiErrorDetail>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ReadonlyArray<ApiErrorDetail>;

  constructor(code: ApiErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? defaultMessages[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaultStatuses[code];
    this.details = options.details;
  }
}

export function isAppError(cause: unknown): cause is AppError {
  return cause instanceof AppError;
}

export function toSafeErrorCode(cause: unknown): ApiErrorCode {
  return isAppError(cause) ? cause.code : "INTERNAL_ERROR";
}

export function toHttpStatus(cause: unknown): number {
  return isAppError(cause) ? cause.status : 500;
}

export function toPublicError(cause: unknown): ApiError {
  if (!isAppError(cause)) {
    return {
      code: "INTERNAL_ERROR",
      message: defaultMessages.INTERNAL_ERROR,
    };
  }

  const publicCodes: ReadonlyArray<ApiErrorCode> = [
    "INVALID_INPUT",
    "MISSING_FIELD",
  ];
  const safeMessage = publicCodes.includes(cause.code)
    ? cause.message
    : defaultMessages[cause.code];

  return {
    code: cause.code,
    message: safeMessage,
    ...(cause.details === undefined ? {} : { details: cause.details }),
  };
}
