alter table public.documents
  add column if not exists user_id uuid;

alter table public.chat_messages
  add column if not exists user_id uuid;

create index if not exists idx_chat_messages_user_created
  on public.chat_messages (user_id, created_at desc)
  where deleted_at is null;

revoke all on public.documents from anon;
revoke all on public.chat_messages from anon;
grant select on public.documents to authenticated;
grant select, insert on public.chat_messages to authenticated;

drop policy if exists documents_anon_read_active on public.documents;
drop policy if exists documents_authenticated_read_active on public.documents;
create policy documents_authenticated_read_active
  on public.documents for select
  to authenticated
  using (deleted_at is null);

drop policy if exists chat_messages_user_select on public.chat_messages;
create policy chat_messages_user_select
  on public.chat_messages for select
  to authenticated
  using (user_id = auth.uid() and deleted_at is null);

drop policy if exists chat_messages_user_insert on public.chat_messages;
create policy chat_messages_user_insert
  on public.chat_messages for insert
  to authenticated
  with check (user_id = auth.uid());

revoke execute on function public.match_documents(vector, double precision, integer)
  from public, anon;
grant execute on function public.match_documents(vector, double precision, integer)
  to authenticated, service_role;

drop function if exists public.replace_document_chunks(text, jsonb);

create or replace function public.replace_document_chunks(
  p_source text,
  p_chunks jsonb,
  p_user_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id != auth.uid() and current_user != 'service_role' then
    raise exception 'User mismatch';
  end if;

  delete from public.documents
  where source = p_source
    and user_id = p_user_id;

  insert into public.documents (
    content,
    embedding,
    source,
    page,
    chunk_index,
    user_id
  )
  select
    chunk->>'content',
    (chunk->'embedding')::text::vector(1536),
    p_source,
    case
      when chunk->'page' = 'null'::jsonb then null
      else (chunk->>'page')::integer
    end,
    (chunk->>'chunk_index')::integer,
    p_user_id
  from jsonb_array_elements(p_chunks) as chunk;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_document_chunks(text, jsonb, uuid)
  from public, anon;
grant execute on function public.replace_document_chunks(text, jsonb, uuid)
  to service_role;

