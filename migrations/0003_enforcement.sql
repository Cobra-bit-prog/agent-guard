alter table policies add column if not exists denylist jsonb not null default '[]';
alter table policies add column if not exists max_hourly_txs integer not null default 20;

alter table profiles add column if not exists webhook_url text;

create table if not exists audit_events (
  id text primary key,
  user_id text not null,
  agent_id text,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_user_idx on audit_events (user_id, created_at desc);

create table if not exists notification_log (
  id text primary key,
  user_id text not null,
  channel text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists notification_log_user_idx on notification_log (user_id, created_at desc);
