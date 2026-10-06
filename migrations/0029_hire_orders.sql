-- Hire us orders. Additive only: new table and indexes.
-- Does not change or remove any existing table.
--
-- Production builds apply this file (npm run db:migrate and server boot).
-- Preview builds skip it: VERCEL_ENV=preview uses the production DATABASE_URL.
-- See scripts/migration-plan.mjs. No extra environment variable is required.
--
-- status: requested (card off or checkout failed), checkout (Stripe open), paid.
-- ip_hash is a hash of the buyer IP, used for the request rate limit.

create table if not exists hire_orders (
  id text primary key,
  package_id text not null,
  package_name text not null,
  amount_usd integer not null,
  name text not null,
  email text not null,
  brief text not null,
  link text,
  status text not null,
  stripe_session_id text,
  ip_hash text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  notified_at timestamptz,
  constraint hire_orders_status_chk check (status in ('requested', 'checkout', 'paid')),
  constraint hire_orders_amount_chk check (amount_usd > 0)
);

create index if not exists hire_orders_email_created_idx
  on hire_orders (email, created_at desc);

create index if not exists hire_orders_ip_hash_created_idx
  on hire_orders (ip_hash, created_at desc);

create unique index if not exists hire_orders_stripe_session_idx
  on hire_orders (stripe_session_id)
  where stripe_session_id is not null;
