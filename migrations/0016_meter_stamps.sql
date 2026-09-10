-- Signed allow|stop receipts for Agent Meter stamp SKU / session passes.
create table if not exists meter_stamps (
  id text primary key,
  pass_id text not null,
  decision text not null,
  chain text not null,
  wallet text,
  address text,
  value_usd numeric,
  hmac text not null,
  created_at timestamptz not null default now()
);

create index if not exists meter_stamps_pass_idx on meter_stamps (pass_id, created_at desc);
