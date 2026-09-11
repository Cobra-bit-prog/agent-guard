-- Agent Meter free-look counter. Identity is X-Agent-Pass hash or literal `anon`. No email.
create table if not exists meter_free_looks (
  identity_key text primary key,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);
