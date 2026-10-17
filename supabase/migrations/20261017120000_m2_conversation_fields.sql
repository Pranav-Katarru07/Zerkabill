-- M2: what we need to message someone back outside an inbound webhook (e.g. after a call),
-- plus audit bookkeeping on bills.
alter table conversations
  add column photon_agent_user_id text,
  add column intake_asked boolean not null default false;

alter table bills
  add column status text not null default 'ok' check (status in ('ok','not_itemized','unreadable','error')),
  add column timings jsonb not null default '{}',
  add column state text; -- 2-letter state used for benchmarks
