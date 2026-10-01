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

/**
 * Hosted Claude (claude.ai, Desktop, mobile, Cowork) redirects to exactly one
 * callback. Source: https://claude.com/docs/connectors/building/authentication
 * and the connector tests in this repo.
 */
export const CLAUDE_MCP_REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

/**
 * Public Dynamic Client Registration stays open for Claude Connectors.
 * redirect_uris must be the hosted Claude callback, or an http loopback URL
 * on localhost / 127.0.0.1 (any port and path) for Claude Code and local dev.
 * Arbitrary https callbacks are rejected so a phisher cannot register their
 * own host and collect the authorization code after consent.
 *
 * The raw host text must be `localhost` or `127.0.0.1`. Decimal, octal, and
 * hex spellings of loopback normalize to 127.0.0.1 in the URL parser and are
 * rejected so the consent screen shows the host the operator expects.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash || parsed.username || parsed.password) return false;
  if (parsed.protocol === "https:") {
    const canonical = new URL(CLAUDE_MCP_REDIRECT_URI);
    return (
      parsed.hostname === canonical.hostname &&
      parsed.port === "" &&
      parsed.pathname === canonical.pathname &&
      parsed.search === ""
    );
  }
  if (parsed.protocol !== "http:") return false;
  return isExplicitLoopback(uri, parsed);
}

export function isLoopbackRedirectUri(uri: string): boolean {
  if (!isAllowedRedirectUri(uri)) return false;
  try {
    return new URL(uri).protocol === "http:";
  } catch {
    return false;
  }
}

function isExplicitLoopback(uri: string, parsed: URL): boolean {
  const match = /^http:\/\/([^/?#]*)/i.exec(uri);
  if (!match) return false;
  const authority = match[1] ?? "";
  if (
    !authority ||
    authority.includes("@") ||
    authority.includes("\\") ||
    authority.startsWith("[")
  ) {
    return false;
  }
  let host = authority;
  const colon = authority.lastIndexOf(":");
  if (colon !== -1) {
    host = authority.slice(0, colon);
    const portText = authority.slice(colon + 1);
    if (!/^[1-9]\d{0,4}$/.test(portText)) return false;
    const portNum = Number(portText);
    if (portNum > 65535) return false;
    const expectedPort = portNum === 80 ? "" : String(portNum);
    if (parsed.port !== expectedPort) return false;
  }
  const hostLower = host.toLowerCase();
  if (hostLower !== "localhost" && hostLower !== "127.0.0.1") return false;
  return parsed.hostname === hostLower;
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
  if (!client || client.redirect_uris.some((uri) => !isAllowedRedirectUri(uri))) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client",
      error_description: client
        ? "This client's redirect_uris are not allowed."
        : "Unknown client. Register first.",
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
    return {
      status: 400,
      body: { error: "invalid_request", error_description: "Choose one of your agents." },
    };
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

export type ConsentTarget =
  | { ok: true; client_name: string; redirect_uri: string; loopback: boolean }
  | { ok: false; error: string };

/** What the consent screen may show before Allow. Uses the registered client, not the query name. */
export async function describeConsentTarget(
  store: OauthStore,
  clientId: string,
  redirectUri: string,
): Promise<ConsentTarget> {
  if (!isAllowedRedirectUri(redirectUri)) {
    return { ok: false, error: "This callback URL is not allowed." };
  }
  const client = await store.getClient(clientId);
  if (!client || client.redirect_uris.some((uri) => !isAllowedRedirectUri(uri))) {
    return { ok: false, error: "This app is not registered." };
  }
  if (!client.redirect_uris.includes(redirectUri)) {
    return { ok: false, error: "This callback URL does not match the registered app." };
  }
  return {
    ok: true,
    client_name: client.client_name,
    redirect_uri: redirectUri,
    loopback: isLoopbackRedirectUri(redirectUri),
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
      body: {
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uri must be https://claude.ai/api/mcp/auth_callback or http://localhost / http://127.0.0.1.",
      },
    };
  }
  const client = newOpaque(CLIENT_PREFIX);
  const name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 80)
      : "MCP client";
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
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
}> {
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
    if (
      !existing ||
      !existing.refresh_expires_at ||
      new Date(existing.refresh_expires_at).getTime() <= now
    ) {
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
  if (
    !isAllowedRedirectUri(redirectUri) ||
    row.client_id !== clientId ||
    row.redirect_uri !== redirectUri
  ) {
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
