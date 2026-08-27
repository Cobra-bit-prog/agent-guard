alter table subscriptions add column if not exists period_ends_at timestamptz;

create table if not exists pay_requests (
  id text primary key,
  user_id text not null,
  plan text not null,
  amount_usdc integer not null,
  amount_base_units text not null,
  reference text not null unique,
  recipient text not null,
  status text not null default 'pending',
  signature text,
  paid_amount_usdc numeric,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists pay_requests_user_idx on pay_requests (user_id, created_at desc);
create index if not exists pay_requests_reference_idx on pay_requests (reference);
