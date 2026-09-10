import { MCP_HUMAN_SCOPE } from "./copy.ts";
import {
  ACCESS_PREFIX,
  CLIENT_PREFIX,
  CODE_PREFIX,
  isValidCodeChallenge,
  isValidCodeVerifier,
  newOpaque,
  REFRESH_PREFIX,
  s256Challenge,
  sha256Hex,
} from "./crypto.ts";
import type { OauthClient, OauthStore } from "./store.ts";

export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;

export type OauthHttpResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  redirect?: string;
};

export type AuthorizeQuery = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string;
};

export function mcpResourceUrl(issuer: string): string {
  return `${issuer.replace(/\/$/, "")}/api/v1/mcp`;
}

export function normalizeScope(raw: string | null | undefined): string | null {
  const parts = (raw ?? "")
    .split(/[\s+]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return MCP_HUMAN_SCOPE;
  if (parts.every((p) => p === MCP_HUMAN_SCOPE)) return MCP_HUMAN_SCOPE;
  return null;
}

export function readAuthorizeQuery(url: URL): AuthorizeQuery {
  return {
    response_type: url.searchParams.get("response_type") ?? "",
    client_id: url.searchParams.get("client_id") ?? "",
    redirect_uri: url.searchParams.get("redirect_uri") ?? "",
    state: url.searchParams.get("state") ?? "",
    code_challenge: url.searchParams.get("code_challenge") ?? "",
    code_challenge_method: url.searchParams.get("code_challenge_method") ?? "",
    scope: url.searchParams.get("scope") ?? "",
    resource: url.searchParams.get("resource") ?? "",
  };
}

export function authorizeQueryFromRecord(input: Record<string, string>): AuthorizeQuery {
  return {
    response_type: input.response_type ?? "",
    client_id: input.client_id ?? "",
    redirect_uri: input.redirect_uri ?? "",
    state: input.state ?? "",
    code_challenge: input.code_challenge ?? "",
    code_challenge_method: input.code_challenge_method ?? "",
    scope: input.scope ?? "",
    resource: input.resource ?? "",
  };
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hash) return false;
    if (parsed.protocol === "http:") {
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function appendQuery(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export type AuthorizeCheck =
  | { ok: true; client: OauthClient; query: AuthorizeQuery; scope: string; resource: string }
  | { ok: false; status: number; error: string; error_description: string; redirect?: string };

export async function checkAuthorizeRequest(
  store: OauthStore,
  query: AuthorizeQuery,
  issuer: string,
): Promise<AuthorizeCheck> {
  if (query.response_type !== "code") {
    return {
      ok: false,
      status: 400,
      error: "unsupported_response_type",
      error_description: "Use response_type=code.",
    };
  }
  if (query.code_challenge_method !== "S256" || !isValidCodeChallenge(query.code_challenge)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      error_description: "PKCE S256 is required.",
    };
  }
  const scope = normalizeScope(query.scope);
  if (!scope) {
    return {
      ok: false,
      status: 400,
      error: "invalid_scope",
      error_description: "This connector only grants Human App MCP access.",
    };
  }
  if (!isAllowedRedirectUri(query.redirect_uri)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      error_description: "redirect_uri is not allowed.",
    };
  }
  const client = await store.getClient(query.client_id);
  if (!client) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client",
      error_description: "Unknown client. Register first.",
    };
  }
  if (!client.redirect_uris.includes(query.redirect_uri)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      error_description: "redirect_uri does not match this client.",
    };
  }
  const resource = query.resource.trim() || mcpResourceUrl(issuer);
  if (resource !== mcpResourceUrl(issuer)) {
    const fail: AuthorizeCheck = {
      ok: false,
      status: 400,
      error: "invalid_target",
      error_description: "resource must be the Agent Control MCP URL.",
    };
    if (query.redirect_uri) {
      fail.redirect = appendQuery(query.redirect_uri, {
        error: fail.error,
        error_description: fail.error_description,
        state: query.state,
      });
    }
    return fail;
  }
  return { ok: true, client, query, scope, resource };
}

export async function completeAuthorize(
  store: OauthStore,
  input: {
    query: AuthorizeQuery;
    userId: string;
    agentId: string;
    issuer: string;
    now?: number;
  },
): Promise<OauthHttpResult> {
  const now = input.now ?? Date.now();
  const checked = await checkAuthorizeRequest(store, input.query, input.issuer);
  if (!checked.ok) {
    if (checked.redirect) return { status: 302, body: null, redirect: checked.redirect };
    return {
      status: checked.status,
      body: { error: checked.error, error_description: checked.error_description },
    };
  }
  const agent = await store.getAgentForUser(input.userId, input.agentId);
  if (!agent) {
    return { status: 400, body: { error: "invalid_request", error_description: "Choose one of your agents." } };
  }
  const code = newOpaque(CODE_PREFIX);
  await store.insertCode({
    code_hash: code.hash,
    client_id: checked.query.client_id,
    user_id: input.userId,
    agent_id: agent.id,
    redirect_uri: checked.query.redirect_uri,
    code_challenge: checked.query.code_challenge,
    scope: checked.scope,
    resource: checked.resource,
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    used_at: null,
  });
  return {
    status: 302,
    body: null,
    redirect: appendQuery(checked.query.redirect_uri, {
      code: code.raw,
      state: checked.query.state,
      iss: input.issuer.replace(/\/$/, ""),
    }),
  };
}

export function denyAuthorize(query: AuthorizeQuery, issuer?: string): OauthHttpResult {
  if (!isAllowedRedirectUri(query.redirect_uri)) {
    return { status: 400, body: { error: "access_denied" } };
  }
  return {
    status: 302,
    body: null,
    redirect: appendQuery(query.redirect_uri, {
      error: "access_denied",
      state: query.state,
      ...(issuer ? { iss: issuer.replace(/\/$/, "") } : {}),
    }),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function registerClient(
  store: OauthStore,
  body: Record<string, unknown>,
  now = Date.now(),
): Promise<OauthHttpResult> {
  const redirectUris = asStringArray(body.redirect_uris);
  if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return {
      status: 400,
      body: { error: "invalid_redirect_uri", error_description: "Provide https (or localhost) redirect_uris." },
    };
  }
  const client = newOpaque(CLIENT_PREFIX);
  const name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 80)
      : "Claude";
  const row = {
    client_id: client.raw,
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none" as const,
    created_at: new Date(now).toISOString(),
  };
  await store.insertClient(row);
  return {
    status: 201,
    body: {
      client_id: row.client_id,
      client_name: row.client_name,
      redirect_uris: row.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      code_challenge_methods: ["S256"],
      client_id_issued_at: Math.floor(now / 1000),
    },
  };
}

function readForm(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

async function issueTokens(
  store: OauthStore,
  input: {
    clientId: string;
    userId: string;
    agentId: string;
    scope: string;
    resource: string | null;
    now: number;
  },
): Promise<{ access_token: string; refresh_token: string; expires_in: number; token_type: "Bearer"; scope: string }> {
  const access = newOpaque(ACCESS_PREFIX);
  const refresh = newOpaque(REFRESH_PREFIX);
  await store.insertToken({
    token_hash: access.hash,
    client_id: input.clientId,
    user_id: input.userId,
    agent_id: input.agentId,
    scope: input.scope,
    resource: input.resource,
    expires_at: new Date(input.now + ACCESS_TTL_MS).toISOString(),
    refresh_hash: refresh.hash,
    refresh_expires_at: new Date(input.now + REFRESH_TTL_MS).toISOString(),
    created_at: new Date(input.now).toISOString(),
  });
  return {
    access_token: access.raw,
    refresh_token: refresh.raw,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    token_type: "Bearer",
    scope: input.scope,
  };
}

export async function exchangeToken(
  store: OauthStore,
  body: Record<string, unknown>,
  issuer: string,
  now = Date.now(),
): Promise<OauthHttpResult> {
  const grant = readForm(body, "grant_type");
  if (grant === "refresh_token") {
    const raw = readForm(body, "refresh_token");
    if (!raw.startsWith(REFRESH_PREFIX)) {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    const existing = await store.getTokenByRefreshHash(sha256Hex(raw));
    if (!existing || !existing.refresh_expires_at || new Date(existing.refresh_expires_at).getTime() <= now) {
      return { status: 400, body: { error: "invalid_grant" } };
    }
    const clientId = readForm(body, "client_id");
    if (clientId && clientId !== existing.client_id) {
      return { status: 400, body: { error: "invalid_client" } };
    }
    const access = newOpaque(ACCESS_PREFIX);
    const refresh = newOpaque(REFRESH_PREFIX);
    const next = {
      token_hash: access.hash,
      client_id: existing.client_id,
      user_id: existing.user_id,
      agent_id: existing.agent_id,
      scope: existing.scope,
      resource: existing.resource,
      expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      refresh_hash: refresh.hash,
      refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
      created_at: new Date(now).toISOString(),
    };
    await store.replaceToken(existing.token_hash, next);
    return {
      status: 200,
      body: {
        access_token: access.raw,
        refresh_token: refresh.raw,
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TTL_MS / 1000),
        scope: existing.scope,
      },
    };
  }

  if (grant !== "authorization_code") {
    return { status: 400, body: { error: "unsupported_grant_type" } };
  }
  const code = readForm(body, "code");
  const verifier = readForm(body, "code_verifier");
  const redirectUri = readForm(body, "redirect_uri");
  const clientId = readForm(body, "client_id");
  if (!code.startsWith(CODE_PREFIX) || !isValidCodeVerifier(verifier)) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  const row = await store.getCode(sha256Hex(code));
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= now) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (s256Challenge(verifier) !== row.code_challenge) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  const consumed = await store.consumeCode(row.code_hash, new Date(now).toISOString());
  if (!consumed) return { status: 400, body: { error: "invalid_grant" } };
  const resource = row.resource ?? mcpResourceUrl(issuer);
  const tokens = await issueTokens(store, {
    clientId: row.client_id,
    userId: row.user_id,
    agentId: row.agent_id,
    scope: row.scope,
    resource,
    now,
  });
  return { status: 200, body: { ...tokens, resource } };
}
