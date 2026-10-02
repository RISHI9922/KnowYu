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

create table public.idempotency_keys (
  key text primary key,
  request_hash text not null,
  status_code integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now()
);

-- Prune rows older than 24h via a scheduled job (pg_cron or Supabase scheduled function):
-- delete from public.idempotency_keys where created_at < now() - interval '24 hours';

create index idx_documents_embedding_hnsw
  on public.documents using hnsw (embedding vector_cosine_ops)
  where deleted_at is null;

create index idx_documents_source
  on public.documents (source)
  where deleted_at is null;

create index idx_chat_messages_conversation_created
  on public.chat_messages (conversation_id, created_at)
  where deleted_at is null;

create index idx_idempotency_keys_created_at
  on public.idempotency_keys (created_at);

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger trg_chat_messages_updated_at
  before update on public.chat_messages
  for each row execute procedure extensions.moddatetime(updated_at);

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

alter table public.documents enable row level security;
alter table public.chat_messages enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on public.documents from anon;
grant select on public.documents to anon;

create policy documents_anon_read_active
  on public.documents for select
  to anon
  using (deleted_at is null);

revoke all on public.chat_messages from anon;
revoke all on public.idempotency_keys from anon;
