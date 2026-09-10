-- OAuth 2.1 (authorization code + PKCE) for MCP Claude Connectors.
-- Access tokens map to an existing human principal and one of their agents.

create table if not exists oauth_clients (
  client_id text primary key,
  client_name text not null default 'Claude',
  redirect_uris jsonb not null default '[]',
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now()
);

create table if not exists oauth_auth_codes (
  code_hash text primary key,
  client_id text not null,
  user_id text not null,
  agent_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists oauth_auth_codes_user_idx on oauth_auth_codes (user_id, expires_at desc);

create table if not exists oauth_access_tokens (
  token_hash text primary key,
  client_id text not null,
  user_id text not null,
  agent_id text not null,
  scope text not null,
  resource text,
  expires_at timestamptz not null,
  refresh_hash text unique,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_access_tokens_user_idx on oauth_access_tokens (user_id, expires_at desc);
create index if not exists oauth_access_tokens_refresh_idx on oauth_access_tokens (refresh_hash);
