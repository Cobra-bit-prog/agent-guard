-- Action Gate: stop-and-ask for non-money actions.
-- Requires DATABASE_URL (Neon). Applied by npm run db:migrate.
-- Does not change the payout wallet.

create table if not exists action_approvals (
  id text primary key,
  user_id text not null,
  agent_id text not null,
  action_type text not null,
  summary text not null,
  preview text not null,
  target text,
  risk text,
  status text not null default 'hold',
  expires_at timestamptz not null,
  decided_at timestamptz,
  channel text,
  created_at timestamptz not null default now()
);

create index if not exists action_approvals_user_status_idx
  on action_approvals (user_id, status, created_at desc);

create index if not exists action_approvals_agent_idx
  on action_approvals (agent_id, status);

create table if not exists action_entitlements (
  user_id text primary key,
  paid_until timestamptz not null,
  updated_at timestamptz not null default now()
);
