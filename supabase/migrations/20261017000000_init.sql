-- Zerkabill schema. Every table has RLS on with no anon policies:
-- only the server (service role) reads/writes. The audit page gets live
-- updates through Realtime Broadcast on its unguessable channel instead.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  photon_space_id text not null unique,
  user_handle text,
  state text not null default 'intake'
    check (state in ('intake','awaiting_bill','auditing','review','awaiting_approval','calling','done')),
  patient_name text,
  hospital text,
  visit_date date,
  insured boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  audit_token text not null unique,          -- random id used in /audit/:token
  image_hash text,                           -- sha256 of the photo, for the parse cache
  provider text,
  account_number text,
  admit_date date,
  discharge_date date,
  total_billed numeric(12,2),
  is_itemized boolean,
  parse_confidence numeric(4,3),
  potential_savings numeric(12,2),
  created_at timestamptz not null default now()
);
create index on bills (conversation_id);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  position int not null,
  code text,
  code_type text,
  description text,
  qty numeric(10,2),
  unit_charge numeric(12,2),
  total_charge numeric(12,2),
  date_of_service date,
  plain_english text,
  plain_english_verified boolean default false,
  low_confidence boolean default false
);
create index on line_items (bill_id);

create table findings (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  line_item_id uuid references line_items(id) on delete cascade, -- null for bill-level (math check)
  rule text not null,
  severity text not null check (severity in ('suspicious','likely_error')),
  explanation text not null,
  estimated_overcharge_usd numeric(12,2) not null default 0,
  evidence_json jsonb not null default '{}'
);
create index on findings (bill_id);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  bill_id uuid references bills(id) on delete cascade,
  purpose text not null check (purpose in ('request_itemized','dispute')),
  to_number text not null,
  restated_text text not null,  -- exactly what the user approved
  source text not null check (source in ('imessage','audit_page')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  bill_id uuid references bills(id) on delete cascade,
  approval_id uuid not null references approvals(id),
  purpose text not null,
  to_number text not null,
  status text not null default 'queued',
  provider_conversation_id text unique,
  transcript jsonb,
  summary text,
  outcome_json jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on calls (conversation_id, created_at desc);

create table price_cache (
  code text not null,
  state text not null,
  avg_submitted_charge numeric(12,2),
  avg_allowed numeric(12,2),
  avg_payment numeric(12,2),
  data_year int not null,
  fetched_at timestamptz not null default now(),
  primary key (code, state)
);

create table parse_cache (
  image_hash text primary key,
  parsed_json jsonb not null,
  created_at timestamptz not null default now()
);

create table processed_messages (
  id text primary key,
  created_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  conversation_id uuid,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on events (created_at desc);

alter table conversations enable row level security;
alter table bills enable row level security;
alter table line_items enable row level security;
alter table findings enable row level security;
alter table approvals enable row level security;
alter table calls enable row level security;
alter table price_cache enable row level security;
alter table parse_cache enable row level security;
alter table processed_messages enable row level security;
alter table events enable row level security;
