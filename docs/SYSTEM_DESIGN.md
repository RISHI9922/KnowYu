# rag-bot System Design

## Architecture

The system separates ingestion from question answering. Ingestion converts approved files into searchable vector records. At query time, the application retrieves a small context set and asks the language model to answer only from it.

```text
                           INGESTION
 /corpus PDFs + Markdown
          |
          v
  extract and normalize --> chunk (300 tokens, 50 overlap)
          |                              |
          +------------------------------v
                               OpenAI embeddings
                                        |
                                        v
                           Supabase documents + pgvector

                              QUERY
 User --> Next.js frontend --> POST /api/v1/chat
                                  |
                                  v
                         embed the question
                                  |
                                  v
                 Supabase match_documents() top 5
                                  |
                                  v
                    build constrained context prompt
                                  |
                                  v
                         OpenAI GPT-4o-mini
                                  |
                                  v
                 streamed answer + citations --> User
```

## High-level flow

The user interacts with the Next.js frontend. A server-side route validates the request and queries Supabase vector search using an OpenAI question embedding. Retrieved passages are formatted as numbered, untrusted context blocks. GPT-4o-mini produces a response, which the server streams with citations back to the frontend.

## Ingestion pipeline

1. Enumerate supported `.pdf` and `.md` files under `/corpus`; reject paths outside that root.
2. Read each file and retain source and one-based page metadata.
3. Normalize Unicode and whitespace without destroying paragraph boundaries.
4. Split paragraphs into sentences and assemble approximately 300-token chunks with 50-token overlap. Never split a sentence unless a single sentence exceeds the maximum.
5. Generate `text-embedding-3-small` embeddings in bounded batches.
6. Upsert chunks using `(source, chunk_index)` as the stable identity and store the 1536-value vector.
7. Log source count, chunk count, rejected files, duration, and request ID. A completed idempotency key is safe to replay.

Partial ingestion is not reported as success. Database writes for a source are transactional; its previous active chunks remain usable until the replacement is complete.

## Query pipeline

1. Validate, trim, and length-bound the question.
2. Generate a 1536-dimensional embedding within a 10-second timeout.
3. Call `match_documents(query_embedding, 0.7, 5)`.
4. If the result is empty, return the standard unsupported-answer state without an LLM call.
5. Build a system prompt containing role, constraints, output rules, and numbered context blocks with source metadata.
6. Ask GPT-4o-mini for a concise answer. User text and retrieved text remain delimited and cannot override system instructions.
7. Stream answer deltas. Emit a final citations event derived from retrieved records, not invented model output.
8. Record latency, token counts, retrieval scores, status, and request ID without logging sensitive full text.

## Prompt boundary

Retrieved documents are evidence, not instructions. The model is told to ignore commands contained inside the corpus, avoid model-memory facts, and state that the documents do not contain the answer when evidence is insufficient. Citation rendering uses server-controlled metadata.

### Groundedness Guarantee

Three checkpoints prevent hallucination:

1. **Pre-LLM gate** — if no chunk scores ≥ 0.7, we never call the LLM.
   The user gets a deterministic "I don't know" response. Zero hallucination risk,
   zero token cost.

2. **Prompt contract** — the system prompt forbids outside knowledge and
   requires the exact "I don't know" string. User input is delimited.

3. **Post-LLM verification** — every citation the model returns is checked
   against the retrieved chunks. Fake citations are stripped and logged.

This means: **the bot can be wrong, but it cannot be confidently wrong.**

## Tradeoffs

| Decision | Chosen approach | Alternative | Rationale and cost |
|---|---|---|---|
| Chunk size | 300 tokens, 50 overlap | 1,000-token chunks | Smaller chunks improve retrieval precision and reduce prompt cost; they may lose broader context, mitigated by overlap and top-5 retrieval |
| Generation model | GPT-4o-mini | GPT-4o | Mini is faster and cheaper for bounded synthesis; complex reasoning quality is lower but unnecessary for policy lookup |
| Vector store | Supabase pgvector | Pinecone | One database simplifies metadata, RLS, migrations, and operations; dedicated vector stores may scale farther at very high volume |
| Retrieval | Cosine top 5, threshold 0.7 | Large top-K or no threshold | Bounded relevant context reduces noise and hallucinations; threshold must be calibrated on the golden set |
| Delivery | Server-sent events | Wait for one JSON response | Streaming improves perceived speed; it adds client state and disconnect handling |

## Failure modes and handling

| Failure | Detection | Behavior | Recovery |
|---|---|---|---|
| Embedding API unavailable | Timeout, 429, or provider 5xx | Return `EMBEDDING_FAILED` or `503`; do not call retrieval | Retry bounded transient failures with jitter; expose retry UI |
| No relevant chunks | Zero rows above 0.7 | Return `NO_RELEVANT_DOCS`; do not hallucinate | Suggest two corpus-related questions |
| OpenAI rate limit | Provider 429 | Return `RATE_LIMITED` or `503` with retry guidance | Honor retry-after; monitor capacity |
| LLM timeout | 30-second deadline | End stream with `LLM_TIMEOUT` | User can retry with same question |
| Database unavailable | Connection/RPC error or 5-second timeout | Health becomes degraded; chat returns `503` | Supabase recovery and alerting |
| Client disconnect | Aborted stream | Cancel downstream work when supported | No user-facing error required |
| Malformed document | Parser failure | Reject that source with a specific ingest error | Correct or replace source; rerun idempotently |
| Duplicate ingest | Reused idempotency key | Return original result | No duplicate chunks |

## Scalability and observability

HNSW cosine indexing supports low-latency retrieval as the corpus grows. Embeddings are batched, API concurrency is bounded, and all list queries have limits. Logs use JSON fields including `requestId`, operation, duration, status, provider request IDs, and error code. Metrics track p50/p95 latency, 429/5xx rates, retrieval hit rate, refusal rate, token cost, and ingestion failures. Alerts fire on sustained health failure or error-budget burn, not individual transient errors.
