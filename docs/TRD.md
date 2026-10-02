# rag-bot Technical Requirements Document

## Overview

rag-bot is a Next.js application that ingests a controlled document corpus, stores chunk embeddings in Supabase Postgres with pgvector, retrieves relevant context, and generates cited answers through OpenAI.

## Technology stack

| Technology | Use | Why |
|---|---|---|
| Next.js 14 App Router | UI and server API | One TypeScript deployment, server components, route handlers, and streaming support |
| TypeScript | Application language | Static contracts across ingestion, retrieval, and response rendering |
| Supabase Postgres | Metadata and messages | Managed relational storage with SQL, migrations, backups, and RLS |
| pgvector | Embedding search | Keeps vector and source metadata transactional and queryable in Postgres |
| OpenAI `text-embedding-3-small` | 1536-dimensional embeddings | Cost-efficient semantic retrieval with a stable vector size |
| OpenAI `gpt-4o-mini` | Grounded answer generation | Low latency and cost for concise corpus-based answers |
| Zod | Runtime validation | Typed validation at untrusted request and environment boundaries |
| Vercel | Hosting | Native Next.js deployment, preview environments, streaming, and environment variables |
| GitHub | Source control and CI | Reviewable changes and automated quality gates |
| Vitest / Playwright | Tests | Fast unit/integration tests and browser-level journey coverage |

## Functional requirements

- **FR1 — Corpus ingestion:** `POST /api/v1/ingest` reads approved PDF or Markdown inputs, extracts text, chunks it, embeds it, and persists it.
- **FR2 — Deterministic chunking:** Content is divided into approximately 300-token chunks with 50-token overlap while preserving paragraph and sentence boundaries.
- **FR3 — Semantic retrieval:** Each question is embedded and supplied to `match_documents()` to return at most five chunks above a 0.7 similarity threshold.
- **FR4 — Grounded generation:** The completion prompt contains retrieved context and explicitly forbids facts not supported by that context.
- **FR5 — Citations:** Supported answers include deduplicated source and page citations traceable to stored chunks.
- **FR6 — Safe refusal:** When retrieval finds no relevant material, the API returns `NO_RELEVANT_DOCS` and the UI presents an “I don't know based on these documents” state.
- **FR7 — Streaming chat:** The chat endpoint streams answer deltas and ends with structured citation metadata.
- **FR8 — Operability:** The service exposes a health endpoint, structured logs, request IDs, timeouts, rate limits, and consistent error envelopes.

## Non-functional requirements

- **NFR1 — Performance:** Median completed chat latency is below five seconds; database retrieval completes within five seconds.
- **NFR2 — Security:** Provider credentials and the Supabase service-role key remain server-only; all input is validated and rate-limited.
- **NFR3 — Reliability:** Ingestion is idempotent, transient provider failures are retryable, and every error is correlated by request ID.
- **NFR4 — Quality and cost:** Golden-set grounded accuracy exceeds 85%, and average variable provider cost remains below $0.01 per query.

## Data model

### `documents`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | `uuid` | primary key, generated | Chunk identity |
| `content` | `text` | not null | Normalized chunk text |
| `embedding` | `vector(1536)` | not null | OpenAI embedding |
| `source` | `text` | not null | Corpus-relative filename |
| `page` | `integer` | nullable, positive | One-based PDF page; null for Markdown |
| `chunk_index` | `integer` | not null, nonnegative | Stable order within a source |
| `created_at` | `timestamptz` | not null, default now | Ingestion time |
| `updated_at` | `timestamptz` | not null, default now | Last modification time |
| `deleted_at` | `timestamptz` | nullable | Soft-delete marker |

## API endpoints

| Method and path | Purpose | Success | Authentication |
|---|---|---:|---|
| `POST /api/v1/ingest` | Ingest approved corpus files | `201` | Administrator bearer token |
| `POST /api/v1/chat` | Retrieve and stream a cited answer | `200` | Public in v1, IP-rate-limited |
| `GET /api/v1/health` | Report application and dependency readiness | `200` or `503` | None |

## Dependencies

- Runtime: `next`, `react`, `react-dom`, `typescript`.
- Data: `@supabase/supabase-js`, pgvector enabled in Supabase.
- AI: official `openai` SDK.
- Validation and parsing: `zod`, a maintained PDF text extractor, and a token-aware tokenizer.
- UI: `lucide-react`; no second icon library.
- Testing: `vitest`, Testing Library, `@playwright/test`.
- Quality: ESLint, Prettier, and TypeScript strict mode.

Versions must be pinned through the lockfile, reviewed by automated dependency updates, and upgraded only after CI and the golden evaluation set pass.

## Constraints and assumptions

The embedding dimension is fixed at 1536; changing models requires a new column or full re-embedding migration. The corpus is trusted administrative input, but its contents are untrusted prompt data. PDF page metadata is retained during extraction. Serverless execution limits require bounded file sizes and batch operations. The first release targets one approved corpus and one production environment.
