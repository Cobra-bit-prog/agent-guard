alter table pay_requests add column if not exists chain text not null default 'solana';
create index if not exists pay_requests_chain_status_idx on pay_requests (chain, status, expires_at);
