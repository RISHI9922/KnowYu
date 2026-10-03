# KnowYu

A retrieval-augmented question-answering bot that answers questions from
your documents — with citations you can verify, and honest refusals when
the answer isn't in the corpus.

Supports PDF and Markdown today. Image support (JPG, PNG, WebP) is
planned for v2 — OCR will run entirely in the browser, so the server
never receives an image binary.

## The problem

Most RAG bots hallucinate. When they can't find an answer, they invent one.
KnowYu structurally cannot.

## What makes it different

Three gates prevent hallucination:

1. **Pre-LLM threshold** — if no chunk scores above 0.7 cosine similarity,
   the LLM is never called. The user gets "I don't know based on the
   provided documents."

2. **Prompt contract** — the system prompt forbids outside knowledge,
   wraps context in XML delimiters, and requires an exact refusal string.

3. **Post-LLM citation verification** — every citation the model returns
   is checked against the retrieved chunks. Fabricated citations are
   stripped before the answer reaches the user.

The result: the bot can be wrong, but it cannot be confidently wrong.

## Supported inputs

| Input | Status | Notes |
|---|---|---|
| PDF | ✅ Supported | Text-based PDFs only (no server-side OCR) |
| Markdown (.md, .markdown) | ✅ Supported | UTF-8 text |
| Images (.jpg, .jpeg, .png, .webp) | 📋 Planned for v2 | OCR runs client-side; the image never leaves the browser |
| Handwritten notes | ⚠️ Limited | OCR works best on printed text; handwriting requires external OCR |

The upload system is designed in
[docs/UPLOAD_SECURITY.md](docs/UPLOAD_SECURITY.md) and
[docs/IMAGE_UPLOAD_SECURITY.md](docs/IMAGE_UPLOAD_SECURITY.md).
The current v1 uses admin-only CLI ingestion via `POST /api/v1/ingest`.

## Preview

| Light | Dark |
|---|---|
| ![KnowYu in light mode](docs/screenshots/light.png) | ![KnowYu in dark mode](docs/screenshots/dark.png) |

Both themes are available via the toggle in the top-right corner. The
choice persists across reloads.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 18) |
| Database | Supabase Postgres + pgvector (HNSW index, cosine distance) |
| LLM | OpenAI GPT-4o-mini |
| Embeddings | OpenAI text-embedding-3-small (1536 dimensions) |
| Rate limiting | Upstash Redis (serverless-safe) |
| Hosting | Vercel-ready |
| Testing | Vitest (20 unit tests) |
| Icons | Lucide React |

## Documentation

Twelve planning documents in `docs/`:

- [PRD](docs/PRD.md) — product requirements, success metrics
- [TRD](docs/TRD.md) — technical requirements, data model
- [System Design](docs/SYSTEM_DESIGN.md) — architecture, tradeoffs, failure modes
- [Security](docs/SECURITY.md) — threat model, prompt injection defense
- [API Design](docs/API_DESIGN.md) — versioning, error codes, streaming format
- [Backend Rules](docs/BACKEND_RULES.md) — coding standards
- [Frontend Rules](docs/FRONTEND_RULES.md) — component standards
- [Design Rules](docs/DESIGN_RULES.md) — colors, typography, universal device support
- [Database Rules](docs/DATABASE_RULES.md) — schema, RLS, indexes
- [Testing Rules](docs/TESTING_RULES.md) — test pyramid, CI config
- [Upload Security](docs/UPLOAD_SECURITY.md) — v2 upload threat model and mitigations
- [Image Upload Security](docs/IMAGE_UPLOAD_SECURITY.md) — image OCR threat model and client-side architecture

## Running locally

Prerequisites: Node.js 20+, Docker, an OpenAI API key with credits, and a
free Upstash Redis database.

```bash
git clone https://github.com/RISHI9922/KnowYu
cd KnowYu
npm install
cp .env.example .env.local
```

Edit `.env.local` with your values:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Same dashboard, server-only |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |
| `INGEST_ADMIN_TOKEN` | `openssl rand -base64 32` |
| `UPSTASH_REDIS_URL` | console.upstash.com free tier |
| `UPSTASH_REDIS_TOKEN` | Same |
| `ALLOWED_ORIGINS` | `http://localhost:3000` for local dev |

Start Supabase locally:

```bash
npx supabase start
npx supabase db reset
```

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Ingest a document: place PDF or Markdown files in `./corpus/`, then:

```bash
source .env.local
curl -X POST http://localhost:3000/api/v1/ingest \
  -H "Authorization: Bearer $INGEST_ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Deploying

Before deploying publicly, add Vercel Password Protection to prevent
unknown users from consuming your OpenAI credits:

1. Push the repo to GitHub.
2. Import the repo at https://vercel.com/new.
3. Set the 8 environment variables from `.env.example`.
4. Deploy.
5. Project Settings → Deployment Protection → enable Password Protection.
6. Share the password only with people you trust.

Once usage stabilizes, you can remove the password. See
[docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

## Cost discipline

Every query is capped at:

- 5 chunks retrieved (not 20)
- 2,400 total tokens
- 500 output tokens
- ~$0.005 per query

Most RAG bots spend 4x more per query. This one publishes its budget.

## Design

The interface is intentionally calm. No gradients, no purple AI colors,
no glassmorphism, no shaders. The reference set is Stripe Docs, Linear,
and Vercel.

Light and dark modes are both supported, respecting the operating system
preference by default and persisting an explicit choice in localStorage.

For image uploads, OCR runs in the user's browser via Tesseract.js. The
original image never reaches the server — only the extracted text is
uploaded as a synthetic Markdown file. This eliminates parser RCE,
decompression bombs, and EXIF metadata leakage by design. See
[docs/IMAGE_UPLOAD_SECURITY.md](docs/IMAGE_UPLOAD_SECURITY.md) for the
full threat model.

## Testing

```bash
npm test
```

20 unit tests cover chunking, prompt construction, and retrieval. A
security CI workflow runs on every push (gitleaks, npm audit, env-guard,
typecheck, test).

## What's not in v1

- Admin browser upload UI (spec in [docs/UPLOAD_SECURITY.md](docs/UPLOAD_SECURITY.md))
- Image upload with client-side OCR (spec in [docs/IMAGE_UPLOAD_SECURITY.md](docs/IMAGE_UPLOAD_SECURITY.md))
- User accounts (single-tenant by design)
- Conversation history persistence (state-only)
- Multi-file corpus management UI

## License

MIT
