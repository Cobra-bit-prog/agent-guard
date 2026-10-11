-- x402 listing-check report payments. Additive only.
-- Preview builds skip this file: VERCEL_ENV=preview uses the production DATABASE_URL.
-- Production applies it with npm run db:migrate. No new payout wallet.

create table if not exists x402_check_orders (
  id text primary key,
  target text not null,
  target_kind text not null,
  sku text not null,
  amount_usd numeric not null,
  amount_base_units text not null,
  chain text,
  reference text not null unique,
  pay_to text not null,
  base_pay_to text not null,
  tx_ref text,
  status text not null,
  paid_at timestamptz,
  report_until timestamptz,
  runs_used integer not null default 0,
  report_json text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint x402_check_orders_sku_chk check (sku = 'x402_report_7d'),
  constraint x402_check_orders_amount_chk check (amount_usd = 19),
  constraint x402_check_orders_status_chk
    check (status in ('pending', 'paid', 'underpaid', 'expired')),
  constraint x402_check_orders_kind_chk check (target_kind in ('url', 'wallet')),
  constraint x402_check_orders_runs_chk check (runs_used >= 0 and runs_used <= 2)
);

create index if not exists x402_check_orders_target_idx
  on x402_check_orders (target, created_at desc);

create index if not exists x402_check_orders_ip_idx
  on x402_check_orders (ip_hash, created_at desc);

create table if not exists x402_check_hits (
  id bigserial primary key,
  ip_hash text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint x402_check_hits_kind_chk check (kind in ('free', 'report'))
);

create index if not exists x402_check_hits_ip_idx
  on x402_check_hits (ip_hash, kind, created_at desc);
