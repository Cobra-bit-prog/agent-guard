import { getSql, type Sql } from "../db.ts";
import type { OauthAccessToken, OauthAgent, OauthAuthCode, OauthClient, OauthStore } from "./store.ts";

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return asStringArray(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export async function ensureOauthSchema(sql?: Sql): Promise<void> {
  const db = sql ?? (await getSql());
  await db.query(`
    create table if not exists oauth_clients (
      client_id text primary key,
      client_name text not null default 'Claude',
      redirect_uris jsonb not null default '[]',
      token_endpoint_auth_method text not null default 'none',
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`
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
    )
  `);
  await db.query(
    `create index if not exists oauth_auth_codes_user_idx on oauth_auth_codes (user_id, expires_at desc)`,
  );
  await db.query(`
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
    )
  `);
  await db.query(
    `create index if not exists oauth_access_tokens_user_idx on oauth_access_tokens (user_id, expires_at desc)`,
  );
  await db.query(
    `create index if not exists oauth_access_tokens_refresh_idx on oauth_access_tokens (refresh_hash)`,
  );
}

function mapClient(row: Record<string, unknown>): OauthClient {
  return {
    client_id: String(row.client_id),
    client_name: String(row.client_name ?? "Claude"),
    redirect_uris: asStringArray(row.redirect_uris),
    token_endpoint_auth_method: "none",
    created_at: iso(row.created_at),
  };
}

function mapCode(row: Record<string, unknown>): OauthAuthCode {
  return {
    code_hash: String(row.code_hash),
    client_id: String(row.client_id),
    user_id: String(row.user_id),
    agent_id: String(row.agent_id),
    redirect_uri: String(row.redirect_uri),
    code_challenge: String(row.code_challenge),
    scope: String(row.scope),
    resource: row.resource == null ? null : String(row.resource),
    expires_at: iso(row.expires_at),
    used_at: row.used_at == null ? null : iso(row.used_at),
  };
}

function mapToken(row: Record<string, unknown>): OauthAccessToken {
  return {
    token_hash: String(row.token_hash),
    client_id: String(row.client_id),
    user_id: String(row.user_id),
    agent_id: String(row.agent_id),
    scope: String(row.scope),
    resource: row.resource == null ? null : String(row.resource),
    expires_at: iso(row.expires_at),
    refresh_hash: row.refresh_hash == null ? null : String(row.refresh_hash),
    refresh_expires_at: row.refresh_expires_at == null ? null : iso(row.refresh_expires_at),
    created_at: iso(row.created_at),
  };
}

function mapAgent(row: Record<string, unknown>): OauthAgent {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    chain: String(row.chain),
    address: String(row.address),
    api_key: String(row.api_key ?? ""),
    is_demo: Boolean(row.is_demo),
  };
}

export function sqlOauthStore(sql: Sql): OauthStore {
  return {
    async insertClient(client) {
      await sql`
        insert into oauth_clients (client_id, client_name, redirect_uris, token_endpoint_auth_method, created_at)
        values (
          ${client.client_id},
          ${client.client_name},
          ${JSON.stringify(client.redirect_uris)}::jsonb,
          ${client.token_endpoint_auth_method},
          ${client.created_at}
        )
      `;
    },
    async getClient(clientId) {
      const rows = await sql`select * from oauth_clients where client_id = ${clientId} limit 1`;
      return rows[0] ? mapClient(rows[0]) : null;
    },
    async insertCode(code) {
      await sql`
        insert into oauth_auth_codes (
          code_hash, client_id, user_id, agent_id, redirect_uri, code_challenge, scope, resource, expires_at
        ) values (
          ${code.code_hash}, ${code.client_id}, ${code.user_id}, ${code.agent_id}, ${code.redirect_uri},
          ${code.code_challenge}, ${code.scope}, ${code.resource}, ${code.expires_at}
        )
      `;
    },
    async getCode(codeHash) {
      const rows = await sql`select * from oauth_auth_codes where code_hash = ${codeHash} limit 1`;
      return rows[0] ? mapCode(rows[0]) : null;
    },
    async consumeCode(codeHash, usedAt) {
      const rows = await sql`
        update oauth_auth_codes
        set used_at = ${usedAt}
        where code_hash = ${codeHash} and used_at is null
        returning code_hash
      `;
      return Boolean(rows[0]);
    },
    async insertToken(token) {
      await sql`
        insert into oauth_access_tokens (
          token_hash, client_id, user_id, agent_id, scope, resource, expires_at, refresh_hash, refresh_expires_at, created_at
        ) values (
          ${token.token_hash}, ${token.client_id}, ${token.user_id}, ${token.agent_id}, ${token.scope},
          ${token.resource}, ${token.expires_at}, ${token.refresh_hash}, ${token.refresh_expires_at}, ${token.created_at}
        )
      `;
    },
    async getToken(tokenHash) {
      const rows = await sql`select * from oauth_access_tokens where token_hash = ${tokenHash} limit 1`;
      return rows[0] ? mapToken(rows[0]) : null;
    },
    async getTokenByRefreshHash(refreshHash) {
      const rows = await sql`select * from oauth_access_tokens where refresh_hash = ${refreshHash} limit 1`;
      return rows[0] ? mapToken(rows[0]) : null;
    },
    async replaceToken(oldTokenHash, next) {
      await sql`delete from oauth_access_tokens where token_hash = ${oldTokenHash}`;
      await this.insertToken(next);
    },
    async listAgentsForUser(userId) {
      const rows = await sql`
        select id, user_id, name, chain, address, api_key, is_demo
        from agents where user_id = ${userId} order by created_at
      `;
      return rows.map(mapAgent);
    },
    async getAgentForUser(userId, agentId) {
      const rows = await sql`
        select id, user_id, name, chain, address, api_key, is_demo
        from agents where user_id = ${userId} and id = ${agentId} limit 1
      `;
      return rows[0] ? mapAgent(rows[0]) : null;
    },
  };
}

export async function getOauthStore(): Promise<OauthStore> {
  const sql = await getSql();
  await ensureOauthSchema(sql);
  return sqlOauthStore(sql);
}
