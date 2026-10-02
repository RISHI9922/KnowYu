# rag-bot API Design Rules

## Principles

The API is REST-oriented, versioned, predictable, and machine-readable. URLs name resources using plural nouns and kebab-case; HTTP methods describe actions. All `/api/v1/` responses use consistent metadata and a request ID.

| Good | Bad | Reason |
|---|---|---|
| `POST /api/v1/documents` | `POST /api/v1/uploadDocument` | Resource noun, not a verb |
| `GET /api/v1/chat-messages` | `GET /api/v1/chat_messages` | URL segments use kebab-case |
| `DELETE /api/v1/documents/{id}` | `GET /api/v1/delete?id=...` | Method expresses deletion |
| `POST /api/v1/ingest` | `POST /api/ingest-v1` | Version has one stable location |

`POST /api/v1/ingest` is an intentional command endpoint because ingestion is a bounded workflow rather than ordinary client-side document creation.

## HTTP methods

| Method | Use | Safe | Idempotent |
|---|---|---:|---:|
| `GET` | Read a resource or collection | Yes | Yes |
| `POST` | Create or start a command | No | No, unless protected by idempotency |
| `PUT` | Fully replace a known resource | No | Yes |
| `PATCH` | Partially update a resource | No | Not guaranteed |
| `DELETE` | Remove a resource | No | Yes |

## Versioning

All public endpoints start with `/api/v1/`. Breaking contract changes require `/api/v2/`; additive fields remain within the current version. Clients must ignore unknown response fields.

## Request format

- `Content-Type: application/json` is required for JSON requests.
- `Authorization: Bearer <token>` is required where the endpoint specifies authentication.
- `X-Request-ID` is optional; the server validates or generates it and echoes it.
- Bodies use JSON with camelCase names, pass strict Zod schemas, and are limited to 10 KB.
- Query parameters are URL-encoded and validated. Unknown parameters return `400`.

## Response envelopes

```json
{
  "data": { "answer": "Employees receive 20 days of leave." },
  "error": null,
  "meta": {
    "requestId": "req_01J9Y8V6QYKJ8A4ZX3H2M1N0PT",
    "timestamp": "2026-10-03T10:30:00.000Z"
  }
}
```

```json
{
  "data": null,
  "error": {
    "code": "INVALID_INPUT",
    "message": "The question must be between 1 and 2000 characters.",
    "details": [{ "field": "question", "reason": "too_long" }]
  },
  "meta": {
    "requestId": "req_01J9Y8V6QYKJ8A4ZX3H2M1N0PT",
    "timestamp": "2026-10-03T10:30:00.000Z"
  }
}
```

`details` is optional and must not reveal internals. A `204` response has no body. Streaming endpoints use typed events rather than the JSON success envelope until the terminal event.

## HTTP status codes

| Status | Meaning |
|---:|---|
| `200` | Successful read, command, or stream |
| `201` | Resource or ingestion result created |
| `204` | Successful request with no response body |
| `400` | Malformed syntax or invalid request metadata |
| `401` | Missing or invalid authentication |
| `403` | Authenticated but not authorized |
| `404` | Resource does not exist |
| `409` | State or idempotency conflict |
| `422` | Well-formed body fails semantic validation |
| `429` | Rate limit exceeded |
| `500` | Unexpected server failure |
| `503` | Dependency unavailable or service not ready |

## Error codes

Use stable `SCREAMING_SNAKE_CASE` codes: `INVALID_INPUT`, `MISSING_FIELD`, `RATE_LIMITED`, `NOT_FOUND`, `UNAUTHORIZED`, `LLM_TIMEOUT`, `EMBEDDING_FAILED`, `DB_TIMEOUT`, `NO_RELEVANT_DOCS`, and `DOCUMENT_TOO_LARGE`. Messages may improve without a version change; clients branch on codes, not messages.

## Pagination, filtering, and sorting

Collections use cursor pagination:

```json
{
  "data": [{ "id": "4e18d6aa-6fc1-47db-bad0-bcad2e02c805" }],
  "error": null,
  "meta": {
    "requestId": "req_01J9Y8V6QYKJ8A4ZX3H2M1N0PT",
    "timestamp": "2026-10-03T10:30:00.000Z",
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTAzVDEwOjAwOjAwWiJ9",
    "hasMore": true
  }
}
```

`limit` defaults to 20 and cannot exceed 100. Exact filters use names such as `source=handbook.pdf`. `sort=createdAt` is ascending and `sort=-createdAt` is descending. Only allowlisted fields are filterable or sortable.

## Rate limits

| Endpoint | Limit | Key |
|---|---:|---|
| `POST /api/v1/chat` | 10/minute | Client IP |
| `POST /api/v1/ingest` | 2/minute | Administrator identity |
| `GET /api/v1/health` | 60/minute | Client IP |

Every limited response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` as a Unix timestamp. A `429` also includes `Retry-After`.

## Timeouts

| Operation | Timeout | On timeout |
|---|---:|---|
| Embedding request | 10s | Return `EMBEDDING_FAILED`, do not retry |
| LLM completion | 30s | Return `LLM_TIMEOUT`, do not retry |
| Database operation | 5s | Return `DB_TIMEOUT` |
| Total chat request | 45s | Hard kill |

Deadlines propagate through downstream calls. A disconnected client aborts avoidable provider work.

## Idempotent ingestion

`POST /api/v1/ingest` requires `Idempotency-Key`, scoped to the authenticated administrator, with at least 24-hour retention. Replaying the same key and request hash returns the original status and body. Reusing the key with a different body returns `409`. Idempotency records are stored in an `idempotency_keys` table with a 24-hour TTL, pruned by a scheduled job.

## CORS

Production origins are an explicit HTTPS allowlist. Never use `Access-Control-Allow-Origin: *` in production. Permit only necessary methods and headers, avoid credentials unless required, and cache preflight responses for a bounded period.

## Chat streaming

The chat response uses `Content-Type: text/event-stream`, UTF-8, no buffering, and heartbeat comments when needed:

```text
event: delta
data: {"text":"Employees receive "}

event: citations
data: {"items":[{"source":"handbook.pdf","page":12}]}

event: done
data: {"requestId":"req_01J9Y8V6QYKJ8A4ZX3H2M1N0PT"}

```

An error after headers are sent uses an `error` event with the standard error object. Clients must handle disconnects and duplicate terminal events safely.

## Health check

`GET /api/v1/health` performs a lightweight database readiness check and reports no secrets:

```json
{
  "data": {
    "status": "ok",
    "version": "1.3.0",
    "checks": { "database": "ok" }
  },
  "error": null,
  "meta": {
    "requestId": "req_01J9Y8V6QYKJ8A4ZX3H2M1N0PT",
    "timestamp": "2026-10-03T10:30:00.000Z"
  }
}
```

Return `503` and `status: "degraded"` when required dependencies are unavailable. Do not call OpenAI on every health request.

## Deprecation

Deprecated endpoints return `Deprecation: true`, an RFC 8594 `Sunset` timestamp, and `Link: </api/v2/resource>; rel="successor-version"`. Announce at least 90 days before removal when security does not require faster action.

## Endpoint documentation template

Each endpoint document includes: purpose; method and path; authentication and authorization; headers; path/query parameters; request schema and example; success schema and example; error codes and statuses; rate limit; idempotency behavior; timeout; streaming behavior; and security notes.

## Naming conventions

| Surface | Convention | Example |
|---|---|---|
| URLs | kebab-case, plural nouns | `/chat-messages` |
| JSON | camelCase | `requestId` |
| Database | snake_case | `chunk_index` |
| Error codes | SCREAMING_SNAKE_CASE | `NO_RELEVANT_DOCS` |
| Environment | SCREAMING_SNAKE_CASE | `OPENAI_API_KEY` |

## Anti-patterns

- Verbs in ordinary resource URLs, unversioned routes, or mixed naming styles.
- `200` for every outcome or leaking stack traces in errors.
- Offset pagination for large mutable collections.
- Unbounded bodies, result sets, provider calls, or timeouts.
- Client-generated citations or provider keys in browser code.
- Retrying non-idempotent requests without a key.
- Wildcard production CORS, undocumented fields, or breaking response changes in v1.
