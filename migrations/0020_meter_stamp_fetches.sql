-- Owner scoreboard: one row each time a stamp is fetched.
-- origin_hash is a truncated sha256 of Origin or User-Agent. Never a raw IP.
create table if not exists meter_stamp_fetches (
  id text primary key,
  stamp_id text,
  source text not null,
  result text not null,
  seller text,
  origin_hash text,
  is_smoke boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists meter_stamp_fetches_created_idx
  on meter_stamp_fetches (created_at desc);

create index if not exists meter_stamp_fetches_seller_idx
  on meter_stamp_fetches (seller, created_at desc);
