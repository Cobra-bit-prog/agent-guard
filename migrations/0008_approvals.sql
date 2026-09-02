-- V1 approval inbox: off-policy pre-sign checks wait for a human.
create table if not exists pending_approvals (
  id text primary key,
  user_id text not null,
  agent_id text not null,
  tx_id text,
  to_address text not null,
  value_usd numeric not null,
  native text,
  reasons jsonb not null default '[]',
  status text not null default 'hold',
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pending_approvals_user_status_idx
  on pending_approvals (user_id, status, created_at desc);

create index if not exists pending_approvals_agent_idx
  on pending_approvals (agent_id, status);
