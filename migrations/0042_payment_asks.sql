-- Who asked to pay. Additive only: one new table and one index.
--
-- One row each time a paid endpoint answers HTTP 402, or creates an unpaid
-- invoice or checkout. It lets us tell real buyers from probes.
-- No raw IP is stored: ip_hash is a sha256 of the IP with a fixed prefix.
-- No payment signature or pass token is stored, only the payer address.
--
-- Preview builds skip this file: VERCEL_ENV=preview uses the production
-- DATABASE_URL. Production applies it with npm run db:migrate. The paid
-- endpoints work the same before this table exists; the log write just fails
-- quietly.

create table if not exists payment_asks (
  id bigserial primary key,
  kind text not null,
  route text not null,
  method text not null,
  status integer not null,
  sku text,
  ip_hash text,
  user_agent text,
  agent text,
  client text,
  wallet text,
  referer text,
  created_at timestamptz not null default now(),
  constraint payment_asks_kind_chk check (kind in ('payment_required', 'unpaid_checkout'))
);

create index if not exists payment_asks_created_idx
  on payment_asks (created_at desc);
