create table if not exists public.corpus_files (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  content_hash text not null unique,
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_corpus_files_created_at
  on public.corpus_files (created_at desc)
  where deleted_at is null;

alter table public.corpus_files enable row level security;
revoke all on public.corpus_files from anon;
revoke all on public.corpus_files from authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('corpus-files', 'corpus-files', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists corpus_files_service_role_all on public.corpus_files;
create policy corpus_files_service_role_all
  on public.corpus_files
  for all
  to service_role
  using (true)
  with check (true);

