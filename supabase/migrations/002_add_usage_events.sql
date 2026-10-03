create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('chat', 'ingest')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  question_hash text,
  client_ip_hash text,
  created_at timestamptz not null default now()
);

create index idx_usage_events_created_at
  on public.usage_events (created_at desc);

create index idx_usage_events_event_type_created
  on public.usage_events (event_type, created_at desc);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon;
revoke all on public.usage_events from authenticated;

create or replace function public.check_daily_budget(
  p_limit_usd numeric
)
returns table (allowed boolean, used_usd numeric)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(cost_usd), 0) < p_limit_usd as allowed,
    coalesce(sum(cost_usd), 0) as used_usd
  from public.usage_events
  where created_at > current_date;
$$;
