-- Agent directory listings. Additive only: new table and indexes.
-- Does not change or remove any existing table.
--
-- Production builds apply this file (npm run db:migrate and server boot).
-- Preview builds skip it: VERCEL_ENV=preview uses the production DATABASE_URL.
-- See scripts/migration-plan.mjs. No extra environment variable is required.
--
-- hidden_at hides a listing from the directory. Set it with SQL.
-- ip_hash is a hash of the poster IP, used for the post rate limit.

create table if not exists agent_listings (
  id text primary key,
  name text not null,
  skills text[] not null,
  pitch text not null,
  contact text not null,
  link text,
  ip_hash text,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint agent_listings_skills_chk check (cardinality(skills) between 1 and 8)
);

create index if not exists agent_listings_visible_idx
  on agent_listings (created_at desc)
  where hidden_at is null;

create index if not exists agent_listings_ip_hash_created_idx
  on agent_listings (ip_hash, created_at desc);
