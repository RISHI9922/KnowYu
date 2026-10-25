alter table public.usage_events
  add column if not exists retrieval_ms integer
    check (retrieval_ms is null or retrieval_ms >= 0),
  add column if not exists generation_ms integer
    check (generation_ms is null or generation_ms >= 0),
  add column if not exists total_ms integer
    check (total_ms is null or total_ms >= 0);

create index if not exists idx_usage_events_chat_latency
  on public.usage_events (total_ms)
  where event_type = 'chat' and total_ms is not null;

