# KnowYu Product Requirements Document

## Product summary

knowyu is a question-answering assistant for a controlled corpus of PDF and Markdown documents. It retrieves relevant passages, answers only from those passages, and cites the source filename and page where available. When the corpus does not support an answer, it says so instead of guessing.

## Problem statement

People lose time searching long handbooks, policies, and reference documents. Keyword search returns documents, not direct answers, and general-purpose assistants may introduce unsupported facts. Users need a fast, trustworthy way to ask natural-language questions and verify every answer against the approved corpus.

## Target user

The primary user is an employee, operator, or customer who needs reliable answers from a bounded document set without learning its folder structure or terminology. Corpus administrators are secondary users who ingest and replace approved documents.

## Goals

- Answer corpus-supported questions in plain language with visible citations.
- Refuse unsupported questions with a clear “I don't know based on these documents” response.
- Make source verification possible in one click or interaction.
- Keep median response time below five seconds and estimated variable cost below $0.01 per query.
- Make corpus ingestion repeatable and observable.

## Non-goals

- General web search or answers from model memory.
- Autonomous actions, tool execution, or business-process automation.
- Authoring, editing, or approving source documents.
- Fine-tuning a model or training a custom embedding model.
- Multi-tenant permissions in the first release.
- OCR for image-only PDFs in the first release.

## User stories

| ID | As a… | I want to… | So that… | Acceptance signal |
|---|---|---|---|---|
| US1 | User | ask a question in natural language | I can find policy information quickly | A grounded answer streams into the chat |
| US2 | User | see citations beside the answer | I can verify the claim | Each supported answer shows filename and page |
| US3 | User | open or identify the cited passage | I can inspect the original wording | Citation metadata maps to an ingested chunk |
| US4 | User | receive an honest unsupported response | I do not act on invented information | Low-relevance retrieval triggers the refusal copy |
| US5 | User | retry after a transient failure | I can recover without retyping | The question remains present and retry is offered |
| US6 | User | use the interface with a keyboard | the product is accessible | Focus order, labels, and submit behavior work without a mouse |
| US7 | Administrator | ingest approved PDFs and Markdown | the assistant uses current material | A successful ingest reports document and chunk counts |
| US8 | Administrator | safely re-run an ingestion request | retries do not duplicate content | An idempotency key returns the original result |

## Scope

### In scope

- PDF and Markdown files from `/corpus`.
- Text extraction, chunking, embedding, and storage in Supabase.
- Semantic retrieval of the five most relevant chunks.
- A responsive chat interface with streamed answers.
- Citations containing source and page metadata.
- Health checks, request IDs, structured errors, rate limiting, and basic operational logging.
- A golden-question evaluation set for retrieval and answer quality.

### Out of scope

- Internet browsing, external search connectors, and user-uploaded files at runtime.
- Speech, images, OCR, document editing, and multilingual guarantees.
- Per-user accounts, billing, analytics dashboards, or advanced administration UI.
- Conversation-wide semantic memory beyond locally stored display history.

## Success metrics

| Metric | Target | How measured |
|---|---:|---|
| Grounded answer accuracy | >85% | Human-scored golden set; answer must be correct and supported |
| Citation correctness | >95% | Citation source contains the supporting claim |
| Unsupported-answer precision | >90% | Unsupported golden questions correctly receive a refusal |
| Hallucination rate | <2% | Golden eval: every claim cites a real chunk or refuses |
| End-to-end latency | <5s p50, <10s p95 | Server timing, accepted request to completed stream |
| Median cost per query | <$0.005 | OpenAI usage logs |
| P95 cost per query | <$0.01 | OpenAI usage logs |
| Median tokens per query | <1,800 | Logged per request |
| Truncation rate | <5% | % of queries hitting the 500-token output cap |
| Availability | 99.5% monthly | Successful health checks and non-5xx chat requests |

## Product behavior

The chat initially presents three example questions derived from the corpus. A user submits one question at a time. The server retrieves relevant passages, supplies only those passages to the model, and streams a concise answer. Citations remain visible after streaming completes. If no chunk meets the relevance threshold, the assistant does not call the completion model and returns the unsupported-answer state with two suggested corpus-related questions.

## Release criteria

Release requires all critical user stories to pass, no known high-severity security defects, successful ingestion of the reference corpus, at least 85% grounded accuracy on the evaluation set, correct refusal behavior, and production configuration verified in Vercel and Supabase.
