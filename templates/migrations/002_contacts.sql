-- Depends on: 001_call_queue.sql (defines the update_updated_at() trigger function)
-- Apply 001_call_queue.sql first.

-- Yappr Contacts
-- Local mirror of leads for CRM-style contact management
-- Stores interaction history across all calls

create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  phone_number text not null unique,  -- E.164 format
  name text,
  email text,
  source text default 'yappr',        -- yappr | facebook | website | manual | import
  tags text[] default '{}',
  do_not_call boolean not null default false,
  metadata jsonb default '{}',        -- flexible fields (CRM ID, custom props, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_phone on contacts(phone_number);
create index if not exists idx_contacts_tags on contacts using gin(tags);

create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();

-- One row per call attempt (links to Yappr call_id for full data retrieval)
create table if not exists contact_interactions (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references contacts(id) on delete set null,
  phone_number text not null,          -- denormalized for easy querying
  yappr_call_id text,                  -- fetch full data from Yappr API with this
  agent_id text,
  direction text,                      -- inbound | outbound | web_call
  disposition text,
  summary text,
  duration_seconds int,
  called_at timestamptz not null default now()
);

create index if not exists idx_contact_interactions_contact_id on contact_interactions(contact_id);
create index if not exists idx_contact_interactions_phone on contact_interactions(phone_number);
create index if not exists idx_contact_interactions_disposition on contact_interactions(disposition);

-- Appointments (for teams using Supabase as their booking store)
create table if not exists appointments (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references contacts(id) on delete set null,
  phone_number text not null,
  name text,
  email text,
  scheduled_at timestamptz not null,
  duration_minutes int default 30,
  status text default 'scheduled',     -- scheduled | confirmed | cancelled | completed
  notes text,
  agent_id text,                       -- which Yappr agent booked this
  yappr_call_id text,                  -- the call that created this appointment
  calendar_event_id text,              -- external calendar event ID if synced
  created_at timestamptz not null default now()
);

create index if not exists idx_appointments_phone on appointments(phone_number);
create index if not exists idx_appointments_scheduled_at on appointments(scheduled_at);
create index if not exists idx_appointments_status on appointments(status);
