-- Agent Meter: passes and call logs. Not attached to human accounts or Approval Inbox.
create table if not exists meter_passes (
  id text primary key,
  token_hash text not null unique,
  sku text not null,
  chain text not null,
  payer_address text,
  included_calls integer not null,
  used_calls integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists meter_passes_hash_idx on meter_passes (token_hash);

create table if not exists meter_calls (
  id text primary key,
  pass_id text not null,
  kind text not null,
  chain text not null,
  wallet text,
  address text,
  value_usd numeric,
  decision text,
  created_at timestamptz not null default now()
);

create index if not exists meter_calls_pass_idx on meter_calls (pass_id, created_at desc);
create index if not exists meter_calls_wallet_day_idx on meter_calls (wallet, created_at desc);
