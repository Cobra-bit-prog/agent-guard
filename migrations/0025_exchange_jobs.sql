-- Job board listings. Additive only: new table and indexes.
-- Does not change or remove any existing table.
--
-- Production builds apply this file (npm run db:migrate and server boot).
-- Preview builds skip it: VERCEL_ENV=preview uses the production DATABASE_URL.
-- See scripts/migration-plan.mjs. No extra environment variable is required.
--
-- amount_usdc is the budget in whole US dollars.
-- Payment columns stay empty while status is 'open' so a later payment
-- step can fill them without renaming this table.
-- hidden_at hides a listing from the board. Set it with SQL.
-- poster_ip_hash is a hash of the poster IP, used for the post rate limit.

create table if not exists exchange_jobs (
  id text primary key,
  title text not null,
  summary text not null,
  poster_kind text not null,
  amount_usdc integer not null,
  status text not null default 'open',
  payer_address text,
  pay_in_signature text,
  payout_signature text,
  payout_to text,
  deadline_at timestamptz not null,
  hirer_ok_at timestamptz,
  worker_ok_at timestamptz,
  fee_usdc numeric not null default 0,
  created_at timestamptz not null default now(),
  contact text not null,
  hidden_at timestamptz,
  poster_ip_hash text,
  constraint exchange_jobs_poster_kind_chk check (poster_kind in ('human', 'agent')),
  constraint exchange_jobs_status_chk check (status in ('open', 'held', 'done', 'refunded')),
  constraint exchange_jobs_amount_chk check (amount_usdc > 0),
  constraint exchange_jobs_fee_chk check (
    (status = 'done' and fee_usdc = (amount_usdc::numeric / 10))
    or (status <> 'done' and fee_usdc = 0)
  ),
  constraint exchange_jobs_pay_in_chk check (
    (
      status = 'open'
      and payer_address is null
      and pay_in_signature is null
    )
    or (
      status in ('held', 'done', 'refunded')
      and payer_address is not null
      and length(btrim(payer_address)) > 0
      and pay_in_signature is not null
      and length(btrim(pay_in_signature)) > 0
    )
  ),
  constraint exchange_jobs_payout_chk check (
    (status in ('open', 'held') and payout_signature is null)
    or (
      status in ('done', 'refunded')
      and payout_signature is not null
      and payout_to is not null
      and length(btrim(payout_to)) > 0
    )
  ),
  constraint exchange_jobs_refund_to_chk check (
    status <> 'refunded' or payout_to = payer_address
  ),
  constraint exchange_jobs_done_ok_chk check (
    status <> 'done'
    or (hirer_ok_at is not null and worker_ok_at is not null)
  )
);

create unique index if not exists exchange_jobs_pay_in_signature_uidx
  on exchange_jobs (pay_in_signature);

create unique index if not exists exchange_jobs_payout_signature_uidx
  on exchange_jobs (payout_signature);

create index if not exists exchange_jobs_status_idx
  on exchange_jobs (status, created_at desc);

create index if not exists exchange_jobs_open_board_idx
  on exchange_jobs (created_at desc)
  where status = 'open' and hidden_at is null;

create index if not exists exchange_jobs_poster_ip_hash_created_idx
  on exchange_jobs (poster_ip_hash, created_at desc);
