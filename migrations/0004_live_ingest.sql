alter table agents add column if not exists is_demo boolean not null default false;
alter table agents add column if not exists api_key text;
alter table agents add column if not exists last_synced_at timestamptz;
alter table agents add column if not exists balance_usd numeric not null default 0;
alter table transactions add column if not exists source text not null default 'demo';
create unique index if not exists transactions_agent_hash_idx on transactions (agent_id, tx_hash);
create unique index if not exists agents_api_key_idx on agents (api_key);
