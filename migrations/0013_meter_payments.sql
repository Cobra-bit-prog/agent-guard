-- Agent Meter invoices + on-chain settlement. Same payout wallet as human $29 USDC.
alter table if exists meter_passes
  add column if not exists signature text,
  add column if not exists paid_amount_usd numeric,
  add column if not exists invoice_id text;

create table if not exists meter_invoices (
  id text primary key,
  reference text not null unique,
  sku text not null,
  pay_to text not null,
  amount_usd numeric not null,
  amount_base_units text not null,
  chain text not null,
  asset text not null,
  status text not null default 'pending',
  signature text,
  paid_amount_usd numeric,
  payer_address text,
  pass_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);

create index if not exists meter_invoices_status_idx on meter_invoices (status, created_at desc);
create index if not exists meter_invoices_ref_idx on meter_invoices (reference);
