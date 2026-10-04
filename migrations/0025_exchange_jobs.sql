-- Agent Exchange v1 test copy.
-- Held back by scripts/migration-plan.mjs: pendingMigrations skips this file
-- unless EXCHANGE_JOBS_APPLY_MIGRATION=1, and always skips it when
-- VERCEL_ENV=preview. Preview builds use the production DATABASE_URL.
-- Do not set EXCHANGE_JOBS_APPLY_MIGRATION on Vercel.
-- Tests apply this file to a throwaway database. Do not run it against prod.
--
-- amount_usdc is integer whole USDC, the same shape as pay_requests.amount_usdc.
-- fee_usdc stays 0 until status is done, then it is exactly 10% (numeric).
-- The 10% is a book label. There is no second on-chain transfer for the fee.
-- One payout_signature per job: 90% to the worker, or 100% back to payer_address.

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

-- A signature already stored on an earned invoice cannot become a job hold.
-- pay_requests, meter_invoices, and spend_audit_invoices stay earned.
create or replace function exchange_jobs_reject_earned_signature()
returns trigger
language plpgsql
as $$
begin
  if new.pay_in_signature is null then
    return new;
  end if;
  if exists (select 1 from pay_requests where signature = new.pay_in_signature)
     or exists (select 1 from meter_invoices where signature = new.pay_in_signature)
     or exists (select 1 from spend_audit_invoices where signature = new.pay_in_signature) then
    raise exception 'earned signature cannot be attached to an exchange job'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists exchange_jobs_pay_in_earned_trg on exchange_jobs;

create trigger exchange_jobs_pay_in_earned_trg
  before insert or update of pay_in_signature
  on exchange_jobs
  for each row
  execute function exchange_jobs_reject_earned_signature();
