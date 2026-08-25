create table if not exists profiles (
  user_id text primary key,
  telegram_chat_id text,
  email_alerts boolean not null default true,
  telegram_alerts boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id text primary key,
  plan text not null default 'free',
  status text not null default 'active',
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  user_id text not null,
  name text not null,
  address text not null,
  chain text not null,
  role text not null default 'Agent',
  status text not null default 'healthy',
  is_paused boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists agents_user_id_idx on agents (user_id);

create table if not exists policies (
  id text primary key,
  agent_id text not null unique,
  user_id text not null,
  daily_limit_usd numeric not null default 2000,
  max_tx_amount_usd numeric not null default 500,
  alert_threshold_usd numeric not null default 400,
  allowlist jsonb not null default '[]'
);

create table if not exists transactions (
  id text primary key,
  agent_id text not null,
  user_id text not null,
  chain text not null,
  tx_hash text not null,
  from_address text not null,
  to_address text not null,
  value_usd numeric not null default 0,
  value_native text not null default '0',
  kind text not null default 'transfer',
  is_violation boolean not null default false,
  status text not null default 'success',
  timestamp timestamptz not null default now()
);
create index if not exists transactions_user_agent_idx on transactions (user_id, agent_id, timestamp desc);

create table if not exists alerts (
  id text primary key,
  agent_id text not null,
  user_id text not null,
  type text not null,
  severity text not null,
  message text not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists alerts_user_idx on alerts (user_id, acknowledged, created_at desc);
