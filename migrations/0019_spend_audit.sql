-- One-shot $49 Wallet Spend Audit invoices (Human App adjacent; not Meter).
create table if not exists spend_audit_invoices (
  id text primary key,
  reference text not null unique,
  sku text not null,
  pay_to text not null,
  base_pay_to text not null,
  amount_usd numeric not null,
  amount_base_units text not null,
  chain text not null,
  address text not null,
  lookback_days integer not null,
  asset text not null default 'usdc',
  status text not null default 'pending',
  signature text,
  paid_amount_usd numeric,
  payer_address text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  snapshot jsonb
);

create index if not exists spend_audit_invoices_ref_idx
  on spend_audit_invoices (reference);

create index if not exists spend_audit_invoices_status_idx
  on spend_audit_invoices (status, created_at desc);
