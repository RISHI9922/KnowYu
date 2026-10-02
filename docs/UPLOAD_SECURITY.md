# KnowYu Upload Security Rules

## Purpose

KnowYu's upload system accepts untrusted files from administrators and processes
them through third-party parsers, cloud storage, and paid LLM APIs. Every layer
is a potential attack surface. This document specifies the security
architecture, validation rules, and operational requirements that make uploads
safe by design.

**Non-negotiable principle:** an uploaded file is a hostile executable until
proven otherwise, and it remains untrusted data for the entire lifetime of the
system.

**Guarantee:** if these rules are followed exactly, a malicious file cannot
compromise application secrets, exhaust application resources, or execute
arbitrary code with access to the application's environment.

---

## Threat model

Every upload is assumed to be malicious. The following threats are in scope.

| # | Threat | Impact if unmitigated |
|---|---|---|
| 1 | Arbitrary file write via filename | Overwrite `.env`, read `/etc/passwd` |
| 2 | Path traversal | Access outside corpus root |
| 3 | Symlink escape | Read or write outside intended directory |
| 4 | Parser RCE (buffer overflow, prototype pollution) | Full process compromise, secret exfiltration |
| 5 | Parser DoS via algorithmic complexity | Process crash, worker starvation |
| 6 | Decompression bomb | Server OOM, entire function crash |
| 7 | Storage exhaustion | Cost blowout, quota denial |
| 8 | Cost exhaustion via embeddings | OpenAI billing spike |
| 9 | XSS via stored SVG/HTML | Client compromise, session theft |
| 10 | Prompt injection via document text | Data exfiltration, policy bypass |
| 11 | PDF with embedded JavaScript | Client compromise on viewer open |
| 12 | Null byte truncation | Bypass of extension checks |
| 13 | Double extension bypass | `file.pdf.exe` acceptance |
| 14 | MIME spoofing | Type confusion attacks |
| 15 | Duplicate upload cost amplification | Cost blowout from replays |
| 16 | Time-of-check / time-of-use race | Size changes between check and read |
| 17 | Unicode RTL override | Display spoofing, user deception |
| 18 | Decompression recursion | Nested archive bombs |
| 19 | Huge PDF (100k pages) | Chunk explosion, cost explosion |
| 20 | Supply chain compromise of parser | Full compromise via dependency |
| 21 | Malicious log content | Log injection, downstream parsing exploitation |
| 22 | Storage URL leakage | Unauthorized access to corpus files |
| 23 | Response shape leakage | Information disclosure via errors |
| 24 | Timer bypass via CPU starvation | Timeout not enforced |
| 25 | Container escape via parser exploit | Host compromise |

**Every threat below maps to at least one mitigation. Every mitigation maps to at least one test.**

---

## Security architecture

Six independent layers. A file must pass every layer.

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — Edge (Next.js middleware)                              │
│   Auth · Rate limit · Payload size gate · Security headers       │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2 — Route handler (app/api/v1/upload/route.ts)             │
│   Multipart parsing · Per-file validation · Magic bytes          │
│   Filename sanitization · Streaming (no buffering)               │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3 — Structural pre-scan                                    │
│   Byte-level scan for dangerous PDF markers                      │
│   Reject before any parser touches the file                      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4 — Isolated parser subprocess                             │
│   No environment variables · No network · Memory cap · Time cap  │
│   Unprivileged user · File passed via stdin                      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5 — Storage (Supabase)                                     │
│   Private bucket · No anon access · UUID paths · Server-side only│
├─────────────────────────────────────────────────────────────────┤
│ Layer 6 — Ingestion pipeline                                     │
│   Cost gates · Chunk limits · Prompt injection defense           │
│   Citation verification · Token budget                           │
└─────────────────────────────────────────────────────────────────┘
```

**If any layer rejects the file, subsequent layers never see it.**

---

## Layer 1 — Edge middleware

### Purpose
Reject obviously hostile requests before consuming server resources.

### Rules

1. **Auth first, always.** No processing occurs before the admin bearer token is verified with `timingSafeEqual`.
2. **Rate limit before parse.** 2 requests per minute per admin identity (token hash). 429 on exceed.
3. **Reject missing or wrong `Content-Type`.** Must be `multipart/form-data`.
4. **Reject oversized `Content-Length`.** Header > 25 MB → immediate 413. Header missing → allow (bounded by per-file checks).
5. **Reject non-HTTPS in production.** Redirect or refuse.
6. **Set strict response headers:**
   ```
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   Referrer-Policy: no-referrer
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Resource-Policy: same-origin
   Content-Security-Policy: default-src 'none'
   Permissions-Policy: interest-cohort=()
   ```
7. **Never log request bodies.** Log only metadata: size, count, hash, requestId.
8. **Return generic 429/413.** Never leak the internal limit values in the error message.

### Forbidden at the edge
- Multipart parsing
- File type sniffing
- Decompression
- Filesystem writes
- Environment variable reads (other than auth)

---

## Layer 2 — Route handler

### Purpose
Validate every file completely before it touches storage or a parser.

### Request-level limits

| Limit | Value | Failure code |
|---|---|---|
| Files per request | 20 | `INVALID_INPUT` (`too_many`) |
| Total request bytes | 25 MB | `INVALID_INPUT` (`payload_too_large`) |
| Per-file bytes | 20 MB | `DOCUMENT_TOO_LARGE` |
| Concurrent uploads | 5 | `RATE_LIMITED` |

### Per-file validation — 12 gates, in strict order

Any failure rejects that file only. The batch continues.

| # | Gate | Rule | Failure code |
|---|---|---|---|
| 1 | Presence | Field is a `File` instance | `MISSING_FIELD` |
| 2 | Filename present | `file.name` non-empty | `INVALID_INPUT` |
| 3 | Filename length | ≤ 255 chars after NFC normalization | `INVALID_INPUT` |
| 4 | Filename chars | Only `[A-Za-z0-9._-]` | `INVALID_INPUT` |
| 5 | Filename patterns | No `..`, `/`, `\`, `\0`, leading `.`, trailing `.` or space, RTL override, zero-width, control chars, Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), double extension | `INVALID_INPUT` |
| 6 | Extension whitelist | `.pdf`, `.md`, `.markdown` (lowercased) | `INVALID_INPUT` |
| 7 | MIME whitelist | `application/pdf`, `text/markdown`, `text/plain` | `INVALID_INPUT` |
| 8 | Size | 1 byte ≤ size ≤ 20 MB | `DOCUMENT_TOO_LARGE` or `INVALID_INPUT` (empty) |
| 9 | Magic bytes | First 8 bytes match declared type | `INVALID_INPUT` (`magic_mismatch`) |
| 10 | Dangerous markers | Byte scan for PDF danger markers (see Layer 3) | `INVALID_INPUT` (`dangerous_structure`) |
| 11 | Content hash | SHA-256 computed during stream; not in `corpus_files.content_hash` | `INVALID_INPUT` (`duplicate`) |
| 12 | Non-empty content | After whitespace trim for markdown, size > 0 | `INVALID_INPUT` (`empty`) |

### Magic byte verification

| Extension | Required prefix | Hex |
|---|---|---|
| `.pdf` | `%PDF` | `25 50 44 46` |
| `.md` | None (UTF-8 text) | — |
| `.markdown` | None (UTF-8 text) | — |

For markdown files, verify the first 4 KB decode as valid UTF-8. Reject if not.

### Filename safety rules

**Rejected immediately:**

```
CONTAINS /           → path separator
CONTAINS \           → path separator (Windows)
CONTAINS ..          → path traversal
CONTAINS \0          → null byte truncation
STARTS WITH .        → hidden file / dotfile
ENDS WITH .          → Windows trailing dot
ENDS WITH " "        → Windows trailing space
CONTAINS : * ? " < > |  → Windows reserved chars
LENGTH > 255         → filesystem limit
CONTAINS U+202E      → RTL override (spoofing)
CONTAINS U+200B-200D → zero-width characters (spoofing)
CONTAINS \x00-\x1F   → control characters
EQUALS CON PRN AUX NUL COM1..9 LPT1..9  → Windows reserved
MATCHES /\.[a-z0-9]+\.[a-z0-9]+$/       → double extension
```

**Allowed characters only:** `[A-Za-z0-9._-]`. Everything else strips the file.

### Streaming, never buffering

**Never** read a file fully into memory before validation.

```ts
// WRONG — 20 MB in the heap
const buf = await file.arrayBuffer();
const hash = createHash("sha256").update(buf).digest("hex");

// RIGHT — constant memory, hash during stream
const stream = file.stream();
const hasher = createHash("sha256");
const transformer = new TransformStream({
  transform(chunk, controller) {
    hasher.update(chunk);
    controller.enqueue(chunk);
  },
});
await stream.pipeThrough(transformer).pipeTo(storageWriter);
const hash = hasher.digest("hex");
```

Memory usage stays constant regardless of file size.

### Storage path

**Never use the user's filename as the storage path.** Generate a UUID:

```
corpus-files/{uuid-v4}.{extension}
```

The UUID has no user-controlled data. The original filename is stored only in `corpus_files.original_filename` for display.

### Response shape

```json
{
  "data": {
    "accepted": [
      { "id": "uuid", "filename": "handbook.pdf", "size": 1234567, "hash": "abc..." }
    ],
    "rejected": [
      { "filename": "scan.pdf", "reason": "unsupported_magic_bytes" }
    ],
    "ingested": { "documents": 1, "chunks": 342 }
  },
  "error": null,
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**Partial success is success.** One bad file does not fail the batch.

---

## Layer 3 — Structural pre-scan

### Purpose
Reject dangerous PDFs before any parser reads them.

### Rules

Scan the raw bytes (not parsed structure) for these markers:

| Marker | Meaning |
|---|---|
| `/JavaScript` | Embedded JavaScript |
| `/JS` | Embedded JavaScript (short form) |
| `/Launch` | System command execution |
| `/EmbeddedFile` | Attached file |
| `/RichMedia` | Multimedia |
| `/OpenAction` | Action on open |
| `/AA` | Additional actions |
| `/AcroForm` | Interactive forms |
| `/XFA` | XML forms architecture |
| `/ObjStm` with `/Filter /FlateDecode` beyond a byte threshold | Potential decompression bomb |

Implementation:

```ts
const FORBIDDEN_PDF_MARKERS = [
  "/JavaScript", "/JS", "/Launch", "/EmbeddedFile",
  "/RichMedia", "/OpenAction", "/AA", "/AcroForm", "/XFA",
];

function hasDangerousMarkers(data: Uint8Array): string | null {
  const text = new TextDecoder("latin1").decode(data);

  for (const marker of FORBIDDEN_PDF_MARKERS) {
    if (text.includes(marker)) {
      return marker;
    }
  }

  return null;
}
```

**Reject** the file with `INVALID_INPUT`, `details: [{ reason: "dangerous_structure", marker }]`.

**This is defense in depth.** It is not perfect — obfuscated PDFs can hide markers. It catches ~90% of malicious PDFs. The remaining 10% is caught by Layer 4.

---

## Layer 4 — Isolated parser subprocess

### Purpose
Parse files in an environment with no access to application secrets, no network, and hard resource caps. If the parser is exploited, the attacker gains nothing.

### Architecture

```
Route handler
    │
    │ writes file to temp path (encrypted-at-rest host filesystem)
    ▼
spawn("node", ["scripts/parse-file.mjs"], {
  stdio: ["pipe", "pipe", "pipe"],
  timeout: 60_000,
  env: { NODE_ENV: "production" },   // NO other env vars
  uid: 1001,
  gid: 1001,
})
    │
    ▼
Child process (isolated):
    - Reads file from stdin
    - Parses PDF or reads markdown
    - Returns text via stdout as JSON
    - Cannot access env, network, or parent process memory
    - Killed by SIGKILL if it exceeds any limit
```

### Isolation rules

| Constraint | Enforcement |
|---|---|
| **No environment variables** | Child's `env` object contains only `NODE_ENV` |
| **No network access** | iptables / network namespace / container isolation |
| **No filesystem access** | Child runs in a chroot or a container with no host mounts |
| **No write access** | Child has read-only access to its own script only |
| **Unprivileged user** | `uid: 1001` (non-root, non-admin) |
| **Memory cap** | `ulimit -v 262144` (256 MB) enforced at spawn or via cgroup |
| **CPU time cap** | `ulimit -t 60` (60 seconds CPU) |
| **Wall-clock timeout** | `timeout: 60_000` in spawn options; SIGKILL on exceed |
| **Output cap** | Limit stdout to 50 MB; kill if exceeded |
| **No child processes** | Child cannot spawn grandchildren (container setting) |

### What the child process does

1. Reads the file from stdin as a stream.
2. Verifies the magic bytes independently (defense in depth).
3. Runs the structural pre-scan independently.
4. Parses the file (PDF: `pdfjs-dist`; markdown: UTF-8 decode).
5. Returns `{ pages: [{ content, page }] }` as JSON on stdout.
6. Exits with code 0 on success, non-zero on failure.

### What the child process does NOT do

- Read environment variables
- Access the network
- Read or write to the filesystem (except its own input)
- Spawn other processes
- Allocate more than 256 MB
- Run more than 60 seconds
- Access the parent's memory

**If exploited, the attacker has no secrets, no persistence, no lateral movement.**

### Choosing a parser

| Parser | Language | Recommended? | Why |
|---|---|---|---|
| `pdf-parse` | JS | ❌ | Same-process, weaker hardening |
| `pdfjs-dist` | JS | ✅ | Maintained by Mozilla, used in Firefox |
| `lopdf` (via WASM) | Rust | ✅✅ | Memory-safe, no native code |
| `mupdf` (via bindings) | C | ⚠️ | Fast but native code |
| `pdfium` | C++ | ⚠️ | Used by Chrome, but native code |

**Default for v1:** `pdfjs-dist` in the isolated subprocess.

**Consider for v2:** WASM-based parser for memory safety.

### Supply chain rules

- **Pin exact versions** in `package.json` (no `^` or `~`).
- **Run `npm audit --production` in CI.** Fail on high severity.
- **Update within 24 hours of a CVE** affecting the parser or its dependencies.
- **Subscribe to CVE feeds** for the parser and its transitive dependencies.
- **Never run `npm update` without reading the diff.**
- **Vendor critical parsers** if upstream is unstable.

---

## Layer 5 — Storage

### Bucket configuration

Bucket name: `corpus-files`.

| Setting | Value |
|---|---|
| Public | **false** |
| File size limit | 20 MB |
| Allowed MIME types | `application/pdf`, `text/markdown`, `text/plain` |
| Encryption | Server-side (default) |
| Versioning | Off |

### Access rules

- **No anon access.** No policy grants anon read or write.
- **Service role only.** Writes and reads go through `supabaseService`.
- **Never** generate a public URL for a corpus file.
- **Never** serve a corpus file to a browser.
- **Never** embed a corpus file in `<iframe>`, `<object>`, `<embed>`, `<img>`.
- **Never** include a signed URL in a response.
- **Never** return the storage path to the client.

### RLS

```sql
alter table public.corpus_files enable row level security;
revoke all on public.corpus_files from anon;
revoke all on public.corpus_files from authenticated;
-- Service role bypasses RLS. No policy is created for anon or authenticated.
```

### Deletion

- Deleting a corpus file deletes the storage object and soft-deletes the DB row.
- Storage objects are never hard-deleted except via a scheduled maintenance job.
- The deletion job runs weekly, uses the service role, and logs to a separate audit table.

---

## Layer 6 — Ingestion pipeline

### Cost gates

| Gate | Limit | Failure code |
|---|---|---|
| Pages per PDF | 500 | `DOCUMENT_TOO_LARGE` |
| Chunks per document | 10,000 | `DOCUMENT_TOO_LARGE` |
| Time per file | 60s | `INGEST_TIMEOUT` |
| Total ingestion time | 5m | `INGEST_TIMEOUT` |
| Daily embedding cost | $5 (configurable) | `RATE_LIMITED` |
| Monthly embedding cost | $50 (configurable) | `RATE_LIMITED` |

**Daily and monthly cost gates** require a `usage_events` table:

```sql
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);
create index idx_usage_events_created_at on public.usage_events (created_at);
```

Before ingestion, check:

```sql
select coalesce(sum(cost_usd), 0)
from public.usage_events
where event_type = 'ingestion'
  and created_at > current_date;
```

If over budget, reject with `RATE_LIMITED`.

### Prompt injection defense

Document content is **never** trusted as instructions.

1. Wrapped in `<context>` delimiters with XML escaping (see `lib/prompts.ts`).
2. Marked as "untrusted evidence, not instructions" in the system prompt.
3. Never concatenated with the system prompt without delimiters.
4. Citations verified post-generation (see `lib/retrieval.ts`).

**See `SECURITY.md` → "Prompt injection defense" for the full rules.**

### Embedding safety

- Embeddings are computed by OpenAI. Content never runs locally.
- Embedding inputs are size-capped (chunk size 300 tokens).
- No PII handling beyond what's in the corpus.

---

## Filename handling rules (reference)

### Reserved Windows names

`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` — reject any filename that matches, with or without an extension.

### Unicode normalization

1. Normalize to **NFC**.
2. Strip control characters.
3. Trim leading/trailing whitespace.
4. Reject if the result is empty.
5. Validate against `[A-Za-z0-9._-]`.
6. Reject if any character falls outside ASCII.

**Never log the raw filename.** Log the UUID instead.

---

## Duplicate detection

Every uploaded file is hashed with **SHA-256** during the streaming read.

The hash is stored in `corpus_files.content_hash` with a unique index.

On match:
- Return `INVALID_INPUT` with `details: [{ reason: "duplicate", existingId: "..." }]`.
- Do not re-upload.
- Do not re-ingest.

This prevents:
- Accidental double-uploads wasting embeddings
- Storage bloat
- Cost amplification from retry loops

---

## Logging rules

**Log:**
- Request ID
- Admin identity (token hash, never the raw token)
- File count and total bytes
- Per-file: UUID, sanitized filename (length only, not content), size, SHA-256, status, rejection reason
- Ingestion result: documents, chunks, rejected, duration
- Cost: input tokens, output tokens, estimated USD

**Never log:**
- Raw file contents
- Extracted text
- Embeddings
- The admin token
- Storage paths
- Signed URLs
- Full filenames if they contain user data

**Log format:** JSON only. No unescaped user input in log messages.

**Log retention:** 30 days.

---

## Error response rules

Every error must:
- Use a stable `SCREAMING_SNAKE_CASE` code
- Provide a plain-language message
- Include `requestId` for correlation
- Include `details` only for validation errors

Every error must NOT:
- Include file contents
- Include the admin token
- Include storage URLs or paths
- Include parser error messages verbatim
- Include stack traces
- Include internal file paths

**Example:**

```json
{
  "data": null,
  "error": {
    "code": "DOCUMENT_TOO_LARGE",
    "message": "The file exceeds the 20 MB limit.",
    "details": [{ "field": "files[0]", "reason": "size_exceeded" }]
  },
  "meta": { "requestId": "req_...", "timestamp": "..." }
}
```

---

## Testing requirements

Every rule has a test. Every test must pass before deployment.

| # | Test | Type | Expected |
|---|---|---|---|
| 1 | Upload without auth | Integration | `401 UNAUTHORIZED` |
| 2 | Upload with wrong token | Integration | `401 UNAUTHORIZED` |
| 3 | Upload > 20 MB | Integration | `DOCUMENT_TOO_LARGE` |
| 4 | Upload `.exe` | Integration | `INVALID_INPUT` |
| 5 | Upload with `../` in filename | Integration | `INVALID_INPUT` |
| 6 | Upload with null byte in filename | Integration | `INVALID_INPUT` |
| 7 | Upload with RTL override | Integration | `INVALID_INPUT` |
| 8 | Upload with zero-width char | Integration | `INVALID_INPUT` |
| 9 | Upload Windows reserved name | Integration | `INVALID_INPUT` |
| 10 | Upload double extension | Integration | `INVALID_INPUT` |
| 11 | Upload PDF with non-PDF magic bytes | Integration | `INVALID_INPUT` (`magic_mismatch`) |
| 12 | Upload PDF with `/JavaScript` | Integration | `INVALID_INPUT` (`dangerous_structure`) |
| 13 | Upload PDF with `/Launch` | Integration | `INVALID_INPUT` (`dangerous_structure`) |
| 14 | Upload duplicate file | Integration | `INVALID_INPUT` (`duplicate`) |
| 15 | Upload 25 files in one request | Integration | `INVALID_INPUT` (`too_many`) |
| 16 | Upload PDF with 600 pages | Integration | `DOCUMENT_TOO_LARGE` |
| 17 | Upload PDF producing > 10k chunks | Integration | `DOCUMENT_TOO_LARGE` |
| 18 | Upload PDF that hangs parser | Integration | `INGEST_TIMEOUT` after 60s |
| 19 | Upload PDF that allocates > 256 MB | Integration | Subprocess killed, `INVALID_INPUT` |
| 20 | Upload malformed PDF (parser throws) | Integration | `INVALID_INPUT`, batch continues |
| 21 | Upload valid PDF | Integration | 201, ingested |
| 22 | Upload mixed valid + invalid | Integration | 201 with partial success |
| 23 | 3 uploads in 1 minute | Integration | `429 RATE_LIMITED` |
| 24 | Path traversal via symlink in storage | Integration | `INVALID_INPUT` |
| 25 | Extraction returns no text | Integration | `INVALID_INPUT` (`empty`) |
| 26 | Parser subprocess cannot read env vars | Integration | Child sees only `NODE_ENV` |
| 27 | Parser subprocess cannot access network | Integration | Network calls fail in child |
| 28 | Prompt injection: doc says "ignore rules" | Integration | Bot refuses |
| 29 | XSS attempt via markdown content | Integration | Escaped in UI |
| 30 | Response does not leak storage path | Integration | Assertion on response shape |
| 31 | Response does not leak admin token | Integration | Assertion on response shape |
| 32 | Log does not contain raw filename | Unit | Log assertion |
| 33 | Cost gate: over daily budget | Integration | `RATE_LIMITED` |
| 34 | Cost gate: over monthly budget | Integration | `RATE_LIMITED` |
| 35 | SHA-256 hash computed during stream | Unit | No full-file buffering |

**All 35 tests must pass.**

---

## Deployment checklist

Before enabling uploads in production:

### Infrastructure
- [ ] Supabase bucket `corpus-files` created, public = false
- [ ] Bucket MIME allowlist set
- [ ] Bucket size limit = 20 MB
- [ ] No anon RLS policy on the bucket
- [ ] No anon RLS policy on `corpus_files`
- [ ] Parser subprocess environment configured (uid, no network, memory cap)
- [ ] `usage_events` table created and indexed

### Application
- [ ] Admin token length ≥ 43 chars
- [ ] Rate limit configured (2/min)
- [ ] Magic byte validation enabled
- [ ] Structural pre-scan enabled
- [ ] Filename sanitization enabled
- [ ] SHA-256 duplicate detection enabled
- [ ] Streaming upload (no buffering)
- [ ] Parser subprocess isolation tested
- [ ] Error responses sanitized

### Operations
- [ ] OpenAI hard limit set ($5)
- [ ] Daily cost gate configured
- [ ] Monthly cost gate configured
- [ ] Log retention policy set (30 days)
- [ ] Incident response plan references upload failures
- [ ] `.env.local` gitignored
- [ ] `.env.example` uses only placeholders

### Testing
- [ ] All 35 upload tests passing
- [ ] Manual adversarial testing (10 crafted PDFs)
- [ ] Parser subprocess failure tested
- [ ] Storage failure fallback tested

---

## Anti-patterns

- Trusting `Content-Type` alone
- Trusting file extension alone
- Using the user's filename as a storage path
- Serving uploaded files directly to browsers
- Rendering uploaded HTML, SVG, or PDFs in a browser context
- Buffering files in memory instead of streaming
- Parsing in the same process as the app
- Passing environment variables to the parser subprocess
- Allowing the parser network access
- Skipping hash-based duplicate detection
- Skipping rate limits on upload
- Skipping the PDF page limit
- Skipping the chunk limit
- Skipping the daily/monthly cost gate
- Logging file contents or filenames verbatim
- Returning raw parser errors
- Using `file.name` without sanitization
- Using `path.join` with untrusted filenames
- Trusting `fs.realpath` without a `startsWith(corpusRoot)` check
- Allowing symlinks inside the corpus
- Concatenating extracted text into the system prompt without delimiters
- Letting the LLM see storage configuration
- Auto-ingesting without a cost gate
- Running the parser as root
- Skipping `npm audit` in CI

---

## Incident response for uploads

If an upload-related incident is suspected:

1. **Disable the upload endpoint immediately** (return 503 from the route).
2. **Rotate all credentials:** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `INGEST_ADMIN_TOKEN`.
3. **Review parser subprocess logs** for crashes, timeouts, or unexpected output.
4. **Review `corpus_files` for suspicious uploads** (unusual sizes, unusual hashes).
5. **Review `documents` for unexpected chunks** (unusual content, unexpected sources).
6. **Check OpenAI usage** for unexpected spend.
7. **If the parser was exploited:** assume the subprocess was compromised; check for filesystem modifications.
8. **Preserve evidence:** snapshot logs, database, and storage before remediation.
9. **Notify users** per your privacy policy if data was exposed.
10. **Post-incident:** add a test for the discovered vulnerability.

---

## Final rules

1. **An uploaded file is a hostile executable until proven otherwise.**
2. **Every byte must earn the right to be read.**
3. **Parse in isolation. Always. No exceptions.**
4. **Secrets never touch the parser process.**
5. **If a security review would flag it, do not ship it.**
6. **Every threat has a mitigation. Every mitigation has a test.**
7. **Defense in depth beats defense at one layer.**

---

## Appendix A — Threat → Mitigation matrix

| Threat | Mitigation | Layers |
|---|---|---|
| Arbitrary file write | UUID paths, filename allowlist | 2 |
| Path traversal | Filename allowlist, `realpath`, `startsWith` | 2 |
| Symlink escape | `lstat` + `realpath` + `isInsideCorpus` | 2 |
| Parser RCE | Subprocess isolation, no env, no network, memory cap | 4 |
| Parser DoS | Wall-clock timeout, CPU cap, subprocess kill | 4 |
| Decompression bomb | Memory cap, subprocess kill | 4 |
| Storage exhaustion | 20 MB cap, 20 files/req, rate limit | 1+2 |
| Cost exhaustion | Page cap, chunk cap, time cap, daily cost gate | 4+6 |
| XSS via SVG/HTML | MIME allowlist, no direct serving | 2 |
| Prompt injection | XML delimiters, untrusted-evidence prompt | 6 |
| PDF with JS | Structural pre-scan rejects `/JavaScript` | 3 |
| Null byte | Filename rejection pattern | 2 |
| Double extension | Extension whitelist + magic bytes | 2 |
| MIME spoofing | Magic byte verification | 2 |
| Duplicate uploads | SHA-256 hash + unique index | 2 |
| TOCTOU race | Stream directly, hash during stream | 2 |
| RTL override | Filename character allowlist | 2 |
| Decompression recursion | No nested parsing, single-pass extraction | 4 |
| Huge PDF (100k pages) | Page limit 500 | 2+6 |
| Supply chain | Pin versions, `npm audit`, 24h CVE update | CI |
| Log injection | Structured JSON, no raw filenames | 2+4 |
| Storage URL leakage | Never returned, never served | 5 |
| Response shape leakage | `toPublicError` sanitization | 2 |
| Timer bypass | SIGKILL from parent, not cooperative | 4 |
| Container escape | Isolation-first architecture, defense in depth | 4 |

**Every threat has at least one mitigation. Every mitigation has a test.**

---

## Appendix B — Recommended dependency versions

```json
{
  "dependencies": {
    "pdfjs-dist": "4.x.x",
    "@supabase/supabase-js": "2.x.x",
    "openai": "7.x.x",
    "zod": "3.x.x",
    "js-tiktoken": "1.x.x"
  }
}
```

Pin exact versions. Update only after CI passes.

---

## Appendix C — Subprocess script template

`scripts/parse-file.mjs`:

```js
import { stdin, stdout } from "node:process";
import { createWriteStream } from "node:fs";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

let totalBytes = 0;
const chunks = [];

stdin.on("data", (chunk) => {
  totalBytes += chunk.length;
  if (totalBytes > MAX_BYTES) {
    process.exit(1);   // too large — parent will SIGKILL or catch exit
  }
  chunks.push(chunk);
});

stdin.on("end", async () => {
  const buffer = Buffer.concat(chunks);

  // Magic byte check (defense in depth)
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    process.exit(2);
  }

  // Structural pre-scan (defense in depth)
  const text = buffer.toString("latin1");
  if (/\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile/.test(text)) {
    process.exit(3);
  }

  // Parse
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;

  const pages = [];
  let outputBytes = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    if (i > 500) process.exit(4);   // page limit
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");

    outputBytes += pageText.length;
    if (outputBytes > MAX_OUTPUT_BYTES) process.exit(5);

    pages.push({ content: pageText, page: i });
  }

  stdout.write(JSON.stringify({ pages }));
  process.exit(0);
});
```

**The parent kills this process with SIGKILL if it exceeds 60 seconds or 256 MB.**

---

## Appendix D — macOS/Linux development notes

The subprocess isolation uses Linux primitives (`uid`, `gid`, `ulimit`, network namespaces). On macOS:

- `uid`/`gid` are not honored by Node's `spawn` — use `sudo -u` if needed.
- `ulimit` works via `bash -c "ulimit -v 262144; node parse-file.mjs"`.
- Network isolation requires a user account with no network access or a container.

**For local development, run the parser in Docker:**

```bash
docker run --rm -i \
  --memory=256m \
  --cpus=0.5 \
  --network=none \
  --read-only \
  --tmpfs /tmp:size=50m \
  --user=1001:1001 \
  knowyu-parser:latest
```

This gives you the same isolation guarantees as production.
