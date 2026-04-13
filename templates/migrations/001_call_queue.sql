-- Yappr Call Queue
-- Manages outbound call scheduling, dispatching, and retry logic
-- Supports multiple agents/campaigns per row

-- Enable pg_cron extension (must be done by superuser / dashboard)
-- create extension if not exists pg_cron;

create table if not exists call_queue (
  id uuid default gen_random_uuid() primary key,

  -- Lead info
  phone_number text not null,
  lead_name text,
  lead_email text,
  lead_data jsonb default '{}',        -- any extra lead fields

  -- Routing (supports multiple agents/campaigns)
  agent_id text not null,              -- Yappr agent UUID
  from_number text not null,           -- E.164 Telnyx number to call from
  campaign text,                       -- optional campaign tag for grouping

  -- Scheduling
  status text not null default 'pending',  -- pending | dispatched | completed | failed | exhausted | do_not_call
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_attempted_at timestamptz,

  -- Yappr tracking
  yappr_call_id text,                  -- UUID from Yappr after dispatching
  disposition text,                    -- final disposition label
  call_summary text,                   -- summary from call.analyzed event

  -- Pre-fetch data (injected as {{variables}} in Yappr call)
  pre_fetch_variables jsonb default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_call_queue_status_next_attempt
  on call_queue(status, next_attempt_at)
  where status = 'pending';
create index if not exists idx_call_queue_phone on call_queue(phone_number);
create index if not exists idx_call_queue_campaign on call_queue(campaign);
create index if not exists idx_call_queue_yappr_call_id on call_queue(yappr_call_id);

-- Updated at trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger call_queue_updated_at
  before update on call_queue
  for each row execute function update_updated_at();

-- Call outcomes (historical record, one per call attempt)
create table if not exists call_outcomes (
  id uuid default gen_random_uuid() primary key,
  call_queue_id uuid references call_queue(id) on delete cascade,
  yappr_call_id text,
  phone_number text not null,
  agent_id text not null,
  disposition text,
  summary text,
  duration_seconds int,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_call_outcomes_queue_id on call_outcomes(call_queue_id);
create index if not exists idx_call_outcomes_phone on call_outcomes(phone_number);

-- Do-not-call list
create table if not exists do_not_call (
  id uuid default gen_random_uuid() primary key,
  phone_number text not null unique,
  reason text,
  added_at timestamptz not null default now()
);

-- pg_cron setup (uncomment after enabling pg_cron extension)
-- select cron.schedule(
--   'dispatch-calls',
--   '* * * * *',
--   $$ select net.http_post(
--     url := 'https://YOUR-PROJECT.supabase.co/functions/v1/dispatch-calls',
--     headers := '{"Authorization": "Bearer YOUR-SERVICE-ROLE-KEY", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   ) $$
-- );

-- RLS policies (adjust to your auth setup)
-- alter table call_queue enable row level security;
-- alter table call_outcomes enable row level security;
