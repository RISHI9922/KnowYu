# rag-bot Database Standards

## Naming conventions

| Object | Convention | Example |
|---|---|---|
| Tables | plural snake_case | `chat_messages` |
| Columns | singular snake_case | `chunk_index` |
| Primary key | `id` | `id` |
| Foreign key | `<table>_id` | `conversation_id` |
| Index | `idx_<table>_<col>` | `idx_documents_source` |
| Unique constraint | `uniq_<table>_<col>` | `uniq_documents_source_chunk` |
| Function | verb_noun | `match_documents` |
| Trigger | `trg_<table>_<action>` | `trg_documents_updated_at` |

## Locked data types

Use `uuid` for IDs, `text` instead of `varchar`, `timestamptz` instead of `timestamp`, `numeric(10,2)` for money, `jsonb` instead of `json`, and `vector(1536)` for OpenAI embeddings. Use `integer` for bounded counters and `boolean` only for truly binary state. Do not store dates or numbers as text.

## Required columns

Every mutable entity has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, and `updated_at timestamptz not null default now()`. Attach Supabase's `moddatetime` trigger to maintain `updated_at`; application code must not be its sole maintainer.

## Schema

```sql
create extension if not exists vector;
create extension if not exists moddatetime schema extensions;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  content text not null check (length(btrim(content)) > 0),
  embedding vector(1536) not null,
  source text not null check (length(btrim(source)) > 0),
  page integer check (page is null or page > 0),
  chunk_index integer not null check (chunk_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uniq_documents_source_chunk unique (source, chunk_index)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(btrim(content)) > 0),
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint citations_is_array check (jsonb_typeof(citations) = 'array')
);

create index idx_documents_embedding_hnsw
  on public.documents using hnsw (embedding vector_cosine_ops)
  where deleted_at is null;
create index idx_documents_source
  on public.documents (source)
  where deleted_at is null;
create index idx_chat_messages_conversation_created
  on public.chat_messages (conversation_id, created_at)
  where deleted_at is null;

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger trg_chat_messages_updated_at
  before update on public.chat_messages
  for each row execute procedure extensions.moddatetime(updated_at);
```

## Vector matching function

The default threshold is 0.7 and default count is 5. Pin the search path and expose only required columns.

```sql
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_threshold double precision default 0.7,
  match_count integer default 5
)
returns table (
  id uuid,
  content text,
  source text,
  page integer,
  chunk_index integer,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    d.id,
    d.content,
    d.source,
    d.page,
    d.chunk_index,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents as d
  where d.deleted_at is null
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;
```

## Row Level Security

Enable RLS on every table, including tables thought to be server-only. The anon role may select active document metadata only when product requirements require direct browser reads; it receives no write policy. Prefer server RPC so the anon role needs no direct table access. `chat_messages` has no anonymous policy in v1. The service-role server client bypasses RLS and must never reach the browser.

```sql
alter table public.documents enable row level security;
alter table public.chat_messages enable row level security;

create policy documents_anon_read_active
  on public.documents for select
  to anon
  using (deleted_at is null);

revoke insert, update, delete on public.documents from anon;
revoke all on public.chat_messages from anon;
```

## Index rules

- Index every foreign key used for joins and every stable column used frequently in `WHERE` or `ORDER BY`.
- For composite indexes, put equality predicates first, then range or ordering columns. Column order matters.
- Prefer partial indexes for the active `deleted_at is null` working set.
- Use HNSW with cosine operator class for embedding lookup and validate recall on the evaluation corpus.
- Every added index must justify read benefit against storage and write cost. Confirm with `EXPLAIN (ANALYZE, BUFFERS)` using representative data.

## Migration rules

Create one migration per coherent change. Names are ordered and descriptive, such as `001_enable_extensions.sql` and `002_create_documents.sql`. Never edit an applied migration; add a corrective migration. Migrations must be transactional where supported, backward-compatible during rolling deployment, and reversible through a documented down operation or restore procedure. Test forward migration and rollback against a production-like copy.

## Query rules

- Never use `select *`; name required columns.
- Parameterize every value. No string-built SQL.
- Every collection query has a deterministic order and limit.
- Inspect new or changed hot queries with `EXPLAIN (ANALYZE, BUFFERS)`.
- Avoid functions on indexed filter columns unless a matching expression index exists.
- Treat database errors as structured application errors, not strings exposed to users.

## N+1 prevention

Bad: load 20 messages, then query citations once per message. Good: fetch citation JSON with the messages, or join and aggregate in one bounded query:

```sql
select m.id, m.role, m.content, m.citations, m.created_at
from public.chat_messages as m
where m.conversation_id = $1
  and m.deleted_at is null
order by m.created_at asc
limit $2;
```

## Transactions and RPC

Multi-step writes that must succeed together belong in a Postgres function invoked through Supabase RPC. Examples include replacing all active chunks for one source and storing a completed ingestion idempotency record. Keep transactions short, acquire locks in a consistent order, and do not perform OpenAI network calls inside a database transaction.

## Backups

Supabase Pro uses automated daily backups with retention monitored by the project owner. On Free, run an encrypted manual `pg_dump` weekly and store it outside the project. For both tiers, test a restore into an isolated environment every 90 days and record duration, row counts, and validation results. A backup is not proven until restore succeeds.

## Soft deletes

Use nullable `deleted_at timestamptz` when auditability or recovery is required. All ordinary reads and vector indexes filter `deleted_at is null`. Unique-key reuse after deletion must be an explicit product choice; the initial document constraint prevents accidental duplicate chunk identities.

## Anti-patterns

- Sequential integer public IDs, `varchar` without a real bound, naive timestamps, or JSON used for relational fields.
- Disabled RLS, browser service-role access, or broad grants to `anon`.
- `select *`, unbounded reads, interpolated SQL, and offset pagination at scale.
- Editing applied migrations or applying production schema changes manually.
- Indexing every column, ignoring composite order, or shipping without query-plan evidence.
- Hard-deleting auditable records or forgetting active-row filters.
- Holding database transactions open across external API calls.

## Pre-ship checklist

- Migrations apply from empty state and from the current production schema.
- RLS is enabled and tested as anon, authenticated where applicable, and service role.
- Vector dimension, operator class, threshold, ordering, and top-K behavior are verified.
- Constraints reject empty content, invalid pages, roles, and duplicate chunks.
- Hot queries use expected indexes and remain bounded.
- Backup and restore ownership is documented; the latest restore test succeeded.
