-- Featured directory slot. Additive only.
-- Adds featured_until on agent_listings and agent_listing_featured_orders.
-- Leaves existing rows and columns in place.
--
-- Production builds apply this file (npm run db:migrate and server boot).
-- Preview builds skip it: VERCEL_ENV=preview uses the production DATABASE_URL.
-- See scripts/migration-plan.mjs. No extra environment variable is required.
--
-- Admin must approve this migration before merge. Do not apply it to
-- production until that approval is on the pull request.

alter table agent_listings
  add column if not exists featured_until timestamptz;

create index if not exists agent_listings_featured_idx
  on agent_listings (featured_until desc)
  where hidden_at is null and featured_until is not null;

create table if not exists agent_listing_featured_orders (
  id text primary key,
  listing_id text not null references agent_listings (id),
  sku text not null,
  amount_usd numeric not null,
  amount_base_units text not null,
  chain text,
  reference text not null unique,
  pay_to text not null,
  base_pay_to text not null,
  tx_ref text,
  status text not null default 'pending',
  ip_hash text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agent_listing_featured_orders_sku_chk check (sku = 'featured_7d'),
  constraint agent_listing_featured_orders_amount_chk check (amount_usd = 19),
  constraint agent_listing_featured_orders_status_chk
    check (status in ('pending', 'paid', 'underpaid', 'expired')),
  constraint agent_listing_featured_orders_chain_chk
    check (chain is null or chain in ('solana', 'base'))
);

create index if not exists agent_listing_featured_orders_listing_idx
  on agent_listing_featured_orders (listing_id, created_at desc);

create index if not exists agent_listing_featured_orders_ip_idx
  on agent_listing_featured_orders (ip_hash, created_at desc);
