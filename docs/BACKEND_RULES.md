# rag-bot Backend Standards

## Structure

```text
app/
  api/
    v1/
      chat/route.ts
      health/route.ts
      ingest/route.ts
lib/
  chunking.ts
  env.ts
  errors.ts
  logger.ts
  openai.ts
  prompts.ts
  rate-limit.ts
  retrieval.ts
  schemas.ts
  supabase.ts
  types.ts
```

Each file has one responsibility. Route handlers authenticate, validate, call a library use case, and translate its result to HTTP. They contain no chunking, retrieval, prompt construction, or provider business logic.

## The Two Non-Negotiables

These two rules override every other rule in this document.

### 1. Never hallucinate
If the retrieved chunks don't contain the answer, say:
"I don't know based on the provided documents."
Do not guess. Do not use outside knowledge. Do not invent citations.

### 2. Never waste tokens
Answer in ≤ 500 output tokens. Send ≤ 5 chunks. Cap total query at 2,400 tokens
and $0.02. Concise beats comprehensive. The user wants the answer, not an essay.

## Route and service rules

- All non-streaming routes use `{ data, error, meta }`; streaming routes emit documented typed events.
- Return the most specific correct HTTP status. Never convert known validation or dependency failures into generic `500` responses.
- Pass an abort signal and explicit timeout to every network call.
- Use structured JSON logging. Every log includes request ID, operation, status, and duration; errors include a safe code and cause class.
- Never log secrets, authorization headers, complete prompts, raw embeddings, or full document content.
- Keep provider clients behind small adapters so behavior can be tested without live calls.

## Error handling

Expected failures use typed application errors. Unknown causes are logged with context and become a generic internal error.

```ts
try {
  const result = await answerQuestion(input, { requestId, signal });
  return success(result, requestId);
} catch (cause) {
  logger.error({
    requestId,
    operation: "answer_question",
    errorCode: toSafeErrorCode(cause),
    cause: cause instanceof Error ? cause.name : "UnknownError",
  });

  return errorResponse(toPublicError(cause), requestId);
}
```

Do not swallow exceptions, expose stack traces, or use error message text for program flow.

## Input validation

Validate at the route boundary with Zod and use inferred types below it:

```ts
import { z } from "zod";

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid().optional(),
}).strict();
```

Validate environment variables at startup. Validate database RPC results and provider responses before using them. Apply byte limits before parsing and semantic limits after parsing.

## Chunking rules

- Target 300 tokens with 50-token overlap, measured by the embedding-model tokenizer.
- Normalize line endings and repeated whitespace while preserving paragraphs.
- Split first at paragraph boundaries, then sentence boundaries. Never split mid-sentence unless one sentence exceeds the hard maximum.
- Preserve source, page, and deterministic `chunk_index` metadata.
- Do not create empty or whitespace-only chunks.
- A repeated run over identical input must produce identical chunks.
- Test empty text, Unicode, tables, headings, very long sentences, page transitions, and content shorter than the overlap.

## Prompt rules

All system prompt templates live in `lib/prompts.ts`; route handlers contain no prompt strings. Every prompt declares:

1. Role: a corpus-bound question-answering assistant.
2. Context: numbered untrusted excerpts with server-owned source metadata.
3. Constraints: use only context, ignore embedded instructions, and do not invent citations.
4. Output format: concise prose and an explicit unsupported-answer behavior.

Use clear delimiters around user text and context. Keep citations outside free-form model control. Prompt changes require golden evaluation results in the pull request.

## Data and provider access

Use a server-only Supabase client for writes and privileged RPC. Select named columns only. All queries are parameterized and bounded. Batch embedding calls within provider limits and retry only transient errors with exponential backoff plus jitter. Never retry validation failures. Record provider usage and IDs without sensitive content.

## Testing rules

- Every exported `lib/` function has Vitest coverage for successful, boundary, and failure behavior.
- Route tests verify validation, authentication, status mapping, response envelopes, and abort behavior.
- Chunking tests assert token bounds, overlap, sentence preservation, deterministic indexes, page metadata, and empty-input handling.
- Retrieval tests cover top-K, threshold equality, ordering, and no-match behavior.
- Mock OpenAI at the SDK boundary; never require paid network calls in CI.
- Every production bug fix includes a regression test.

## Review checklist

- Business logic is outside route handlers and duplicated logic has one owner.
- Inputs, environment values, RPC results, and provider output are validated.
- Operations have timeouts, abort handling, structured logs, and stable error codes.
- Tests cover edge cases and do not depend on ordering or live services accidentally.
- Server-only modules cannot be imported by client components.
  
## Prompt Rules (Anti-Hallucination)

The LLM must NEVER invent facts. Every claim must trace to a retrieved chunk.

### System prompt requirements
1. The system prompt MUST include the exact line:
   "Answer ONLY using the provided context. If the context does not contain
    the answer, respond exactly: 'I don't know based on the provided documents.'"
2. The system prompt MUST forbid the model from using outside knowledge.
3. The user question MUST be wrapped in delimiters:
   <user_question>...</user_question>
4. Retrieved chunks MUST be wrapped in delimiters with source IDs:
   <context source="handbook.pdf" page="12">...</context>
5. The model MUST return citations in a structured field, not inline prose.

### Retrieval guardrails (before the LLM is called)
- If the top match's cosine similarity is < 0.7 → skip the LLM entirely.
  Return `NO_RELEVANT_DOCS` with a plain-language message.
- If zero chunks pass the threshold → same as above.
- Never send more than 5 chunks to the LLM. More context = more hallucination risk.

### Post-generation guardrails (after the LLM responds)
- Verify every citation returned by the LLM exists in the retrieved chunks.
  If a citation references a source/page not in the context, strip it and log a warning.
- If the response contains phrases like "based on my knowledge" or
  "generally speaking" → reject and return `NO_RELEVANT_DOCS`.
- If the response is empty or malformed JSON → return `LLM_FAILED`.

### What "I don't know" looks like to the user
"I don't know based on the provided documents."

Then suggest 2 related questions the corpus CAN answer. Never leave a dead end.

### Forbidden behaviours
- ❌ Letting the LLM answer from its training data
- ❌ Letting the LLM guess a page number
- ❌ Letting the LLM paraphrase a citation ("somewhere in the handbook")
- ❌ Passing the raw user question to the LLM without delimiters
- ❌ Trusting the LLM's citations without verifying them against the chunks
