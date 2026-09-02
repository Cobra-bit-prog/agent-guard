-- On-demand Agent Control audit reports (Excel / PDF). Snapshot is enough to re-download.
create table if not exists audit_reports (
  id text primary key,
  user_id text not null,
  agent_id text not null,
  agent_name text not null,
  agent_address text not null,
  chain text not null,
  row_count integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_reports_user_idx
  on audit_reports (user_id, created_at desc);

create index if not exists audit_reports_agent_idx
  on audit_reports (agent_id, created_at desc);
