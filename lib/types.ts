export type ApiErrorCode =
  | "INVALID_INPUT"
  | "MISSING_FIELD"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR"
  | "LLM_TIMEOUT"
  | "LLM_FAILED"
  | "EMBEDDING_FAILED"
  | "DB_TIMEOUT"
  | "NO_RELEVANT_DOCS"
  | "DOCUMENT_TOO_LARGE";

export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiErrorDetail {
  field?: string;
  reason: string;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: ReadonlyArray<ApiErrorDetail>;
}

export interface ApiSuccess<T> {
  data: T;
  error: null;
  meta: ApiMeta;
}

export interface ApiFailure {
  data: null;
  error: ApiError;
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Citation {
  source: string;
  page: number | null;
}

export interface DocumentMatch extends Citation {
  id: string;
  content: string;
  chunkIndex: number;
  similarity: number;
}

export interface TextChunk {
  content: string;
  chunkIndex: number;
}

export interface IngestedChunk extends TextChunk, Citation {
  embedding: ReadonlyArray<number>;
}

export type ChatStreamEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "citations"; data: { items: ReadonlyArray<Citation> } }
  | { event: "done"; data: { requestId: string } }
  | { event: "error"; data: ApiError };
