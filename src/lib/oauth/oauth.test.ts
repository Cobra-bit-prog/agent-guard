import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSENT_ALLOW,
  CONSENT_APP_LABEL,
  CONSENT_EYEBROW,
  CONSENT_HEADLINE,
  CONSENT_HUMAN_LINE,
  CONSENT_KEYS,
  CONSENT_LEDE,
  CONSENT_LOOPBACK,
  CONSENT_REDIRECT_LABEL,
  CONSENT_WHAT,
  CONSENT_WHAT_HEADING,
  MCP_HUMAN_SCOPE,
  PRIVACY_BODY,
  PRIVACY_CONTACT,
  PRIVACY_HEADLINE,
  PRIVACY_KEEP_HEADING,
  PRIVACY_LEDE,
  SUPPORT_EMAIL,
} from "./copy.ts";
import { isAccessToken, s256Challenge, sha256Hex } from "./crypto.ts";
import { handleOauthDiscovery } from "./http.ts";
import {
  authorizationServerMetadata,
  oauthWwwAuthenticate,
  protectedResourceMetadata,
} from "./metadata.ts";
import {
  checkAuthorizeRequest,
  completeAuthorize,
  denyAuthorize,
  describeConsentTarget,
  exchangeToken,
  isAllowedRedirectUri,
  mcpResourceUrl,
  registerClient,
} from "./protocol.ts";
import { clientIpForRegisterLimit, consumeRegisterSlot } from "./register-limit.ts";
import { resolveMcpCredential } from "./resolve.ts";
import { memoryOauthStore } from "./store.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ISSUER = "https://agent-control.net";
const MCP = `${ISSUER}/api/v1/mcp`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function verifier(): string {
  return randomBytes(32).toString("base64url");
}

const BANNED_CUSTOMER = [
  /poll_url/,
  /must_abort/,
  /\babort\b/i,
  /Agent Meter/,
  /X-Agent-Pass/,
  /\bHelius\b/,
  /cheaper/i,
];

describe("Claude Connectors OAuth 2.1 + PKCE", () => {
  it("registers a public PKCE client and completes authorize → token → refresh", async () => {
    const store = memoryOauthStore([
      {
        id: "agent-1",
        user_id: "user-1",
        name: "Ops bot",
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
        api_key: "ag_live_key",
        is_demo: false,
      },
    ]);
    const registered = await registerClient(store, {
      client_name: "Claude",
      redirect_uris: [REDIRECT],
    });
    assert.equal(registered.status, 201);
    const clientId = (registered.body as { client_id: string }).client_id;

    const pkce = verifier();
    const query = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: "st-1",
      code_challenge: s256Challenge(pkce),
      code_challenge_method: "S256",
      scope: MCP_HUMAN_SCOPE,
      resource: MCP,
    };
    const allowed = await checkAuthorizeRequest(store, query, ISSUER);
    assert.equal(allowed.ok, true);

    const done = await completeAuthorize(store, {
      query,
      userId: "user-1",
      agentId: "agent-1",
      issuer: ISSUER,
    });
    assert.equal(done.status, 302);
    const location = new URL(done.redirect ?? "");
    assert.equal(location.searchParams.get("state"), "st-1");
    assert.equal(location.searchParams.get("iss"), ISSUER);
    const code = location.searchParams.get("code") ?? "";
    assert.match(code, /^oac_/);

    const token = await exchangeToken(
      store,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: pkce,
      },
      ISSUER,
    );
    assert.equal(token.status, 200);
    const issued = token.body as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      scope: string;
    };
    assert.equal(issued.token_type, "Bearer");
    assert.equal(issued.scope, MCP_HUMAN_SCOPE);
    assert.equal(isAccessToken(issued.access_token), true);

    const cred = await resolveMcpCredential(
      new Request(MCP, { headers: { Authorization: `Bearer ${issued.access_token}` } }),
      store,
    );
    assert.equal(cred.via, "oauth");
    assert.equal(cred.apiKey, "ag_live_key");
    assert.equal(cred.userId, "user-1");
    assert.equal(cred.agentId, "agent-1");

    const refreshed = await exchangeToken(
      store,
      { grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: clientId },
      ISSUER,
    );
    assert.equal(refreshed.status, 200);
    const next = refreshed.body as { access_token: string };
    assert.notEqual(next.access_token, issued.access_token);
    const old = await resolveMcpCredential(
      new Request(MCP, { headers: { Authorization: `Bearer ${issued.access_token}` } }),
      store,
    );
    assert.equal(old.apiKey, "");
  });

  it("rejects a wrong PKCE verifier and does not mint a token", async () => {
    const store = memoryOauthStore([
      {
        id: "agent-1",
        user_id: "user-1",
        name: "Ops bot",
        chain: "solana",
        address: "addr",
        api_key: "ag_live_key",
        is_demo: false,
      },
    ]);
    const registered = await registerClient(store, { redirect_uris: [REDIRECT] });
    const clientId = (registered.body as { client_id: string }).client_id;
    const pkce = verifier();
    const query = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      state: "s",
      code_challenge: s256Challenge(pkce),
      code_challenge_method: "S256",
      scope: "",
      resource: "",
    };
    const done = await completeAuthorize(store, {
      query,
      userId: "user-1",
      agentId: "agent-1",
      issuer: ISSUER,
    });
    const code = new URL(done.redirect ?? "").searchParams.get("code") ?? "";
    const bad = await exchangeToken(
      store,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier(),
      },
      ISSUER,
    );
    assert.equal(bad.status, 400);
  });

  it("rejects arbitrary https redirect_uris and keeps the Claude callback plus loopback", async () => {
    const store = memoryOauthStore();
    const evil = await registerClient(store, {
      client_name: "Claude",
      redirect_uris: ["https://evil.example/steal"],
    });
    assert.equal(evil.status, 400);
    assert.equal((evil.body as { error: string }).error, "invalid_redirect_uri");

    const mixed = await registerClient(store, {
      redirect_uris: [REDIRECT, "https://evil.example/steal"],
    });
    assert.equal(mixed.status, 400);

    const lookalike = await registerClient(store, {
      redirect_uris: ["https://claude.ai.evil.com/api/mcp/auth_callback"],
    });
    assert.equal(lookalike.status, 400);

    const decimalLoopback = await registerClient(store, {
      redirect_uris: ["http://2130706433/cb"],
    });
    assert.equal(decimalLoopback.status, 400);

    const userinfo = await registerClient(store, {
      redirect_uris: ["https://user:pass@claude.ai/api/mcp/auth_callback"],
    });
    assert.equal(userinfo.status, 400);

    const hosted = await registerClient(store, {
      client_name: "Claude",
      redirect_uris: [REDIRECT],
    });
    assert.equal(hosted.status, 201);

    const local = await registerClient(store, {
      client_name: "Local tool",
      redirect_uris: ["http://127.0.0.1:3118/callback"],
    });
    assert.equal(local.status, 201);
    assert.equal((local.body as { client_name: string }).client_name, "Local tool");

    const localhost = await registerClient(store, {
      redirect_uris: ["http://localhost:8080/any/path?x=1"],
    });
    assert.equal(localhost.status, 201);
    assert.equal((localhost.body as { client_name: string }).client_name, "MCP client");

    assert.equal(isAllowedRedirectUri(REDIRECT), true);
    assert.equal(isAllowedRedirectUri("https://CLAUDE.ai/api/mcp/auth_callback"), true);
    assert.equal(isAllowedRedirectUri("http://localhost/callback"), true);
    assert.equal(isAllowedRedirectUri("http://127.0.0.1:9/cb"), true);
    assert.equal(isAllowedRedirectUri("https://evil.example/steal"), false);
    assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback/extra"), false);
    assert.equal(isAllowedRedirectUri("http://localhost.evil.com/callback"), false);
    assert.equal(isAllowedRedirectUri("https://127.0.0.1/callback"), false);
  });

  it("does not authorize or deny-redirect to a non-allowlisted redirect_uri", async () => {
    const store = memoryOauthStore([
      {
        id: "agent-1",
        user_id: "user-1",
        name: "Ops bot",
        chain: "solana",
        address: "addr",
        api_key: "ag_live_key",
        is_demo: false,
      },
    ]);
    await store.insertClient({
      client_id: "oc_evil",
      client_name: "Claude",
      redirect_uris: ["https://evil.example/steal"],
      token_endpoint_auth_method: "none",
      created_at: new Date(0).toISOString(),
    });
    const query = {
      response_type: "code",
      client_id: "oc_evil",
      redirect_uri: "https://evil.example/steal",
      state: "phish",
      code_challenge: s256Challenge(verifier()),
      code_challenge_method: "S256",
      scope: MCP_HUMAN_SCOPE,
      resource: MCP,
    };
    const checked = await checkAuthorizeRequest(store, query, ISSUER);
    assert.equal(checked.ok, false);
    if (!checked.ok) assert.equal(checked.redirect, undefined);
    const denied = denyAuthorize(query, ISSUER);
    assert.equal(denied.status, 400);
    assert.equal(denied.redirect, undefined);

    const described = await describeConsentTarget(store, "oc_evil", "https://evil.example/steal");
    assert.equal(described.ok, false);
  });

  it("shows the registered client name and the exact redirect the code will use", async () => {
    const store = memoryOauthStore();
    const registered = await registerClient(store, {
      client_name: "Local tool",
      redirect_uris: ["http://127.0.0.1:3118/callback"],
    });
    const clientId = (registered.body as { client_id: string }).client_id;
    const described = await describeConsentTarget(
      store,
      clientId,
      "http://127.0.0.1:3118/callback",
    );
    assert.equal(described.ok, true);
    if (described.ok) {
      assert.equal(described.client_name, "Local tool");
      assert.equal(described.redirect_uri, "http://127.0.0.1:3118/callback");
      assert.equal(described.loopback, true);
    }
    const mismatch = await describeConsentTarget(store, clientId, "http://localhost:3118/callback");
    assert.equal(mismatch.ok, false);
  });

  it("rate-limits registration attempts per client IP", () => {
    const buckets = new Map<string, number[]>();
    const opts = { max: 2, windowMs: 10_000, buckets };
    assert.equal(consumeRegisterSlot("203.0.113.9", 1_000, opts).ok, true);
    assert.equal(consumeRegisterSlot("203.0.113.9", 1_100, opts).ok, true);
    const blocked = consumeRegisterSlot("203.0.113.9", 1_200, opts);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
    assert.equal(consumeRegisterSlot("203.0.113.10", 1_200, opts).ok, true);
    assert.equal(consumeRegisterSlot("203.0.113.9", 1_000 + 10_000, opts).ok, true);

    const request = new Request("https://agent-control.net/oauth/register", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    assert.equal(clientIpForRegisterLimit(request), "203.0.113.9");
    const realIp = new Request("https://agent-control.net/oauth/register", {
      headers: { "x-real-ip": "198.51.100.4" },
    });
    assert.equal(clientIpForRegisterLimit(realIp), "198.51.100.4");
    assert.equal(
      clientIpForRegisterLimit(new Request("https://agent-control.net/oauth/register")),
      "unknown",
    );
  });

  it("deny redirects with access_denied and never binds an agent", async () => {
    const denied = denyAuthorize(
      {
        response_type: "code",
        client_id: "oc_x",
        redirect_uri: REDIRECT,
        state: "nope",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
        scope: MCP_HUMAN_SCOPE,
        resource: MCP,
      },
      ISSUER,
    );
    assert.equal(denied.status, 302);
    const url = new URL(denied.redirect ?? "");
    assert.equal(url.searchParams.get("error"), "access_denied");
    assert.equal(url.searchParams.get("state"), "nope");
    assert.equal(url.searchParams.get("iss"), ISSUER);
  });

  it("keeps Bearer agent API keys as the MCP credential when the token is not OAuth", async () => {
    const store = memoryOauthStore();
    const cred = await resolveMcpCredential(
      new Request(MCP, { headers: { Authorization: "Bearer ag_cursor_key" } }),
      store,
    );
    assert.equal(cred.via, "api_key");
    assert.equal(cred.apiKey, "ag_cursor_key");
    const header = await resolveMcpCredential(
      new Request(MCP, { headers: { "X-Api-Key": "ag_from_header" } }),
      store,
    );
    assert.equal(header.via, "api_key");
    assert.equal(header.apiKey, "ag_from_header");
  });

  it("does not treat a forged oat_ bearer as an agent API key", async () => {
    const store = memoryOauthStore();
    const cred = await resolveMcpCredential(
      new Request(MCP, { headers: { Authorization: "Bearer oat_forged" } }),
      store,
    );
    assert.equal(cred.via, "oauth");
    assert.equal(cred.apiKey, "");
  });
});

describe("OAuth discovery metadata", () => {
  it("advertises authorization code + PKCE + DCR for the MCP resource", () => {
    const as = authorizationServerMetadata(ISSUER);
    assert.equal(as.authorization_endpoint, `${ISSUER}/oauth/authorize`);
    assert.equal(as.token_endpoint, `${ISSUER}/oauth/token`);
    assert.equal(as.registration_endpoint, `${ISSUER}/oauth/register`);
    assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(as.token_endpoint_auth_methods_supported, ["none"]);
    assert.equal(as.authorization_response_iss_parameter_supported, true);
    const pr = protectedResourceMetadata(ISSUER);
    assert.equal(pr.resource, mcpResourceUrl(ISSUER));
    assert.match(oauthWwwAuthenticate(ISSUER), /oauth-protected-resource\/api\/v1\/mcp/);
  });

  it("serves well-known JSON for AS and protected resource", async () => {
    const as = handleOauthDiscovery(
      new Request(`${ISSUER}/.well-known/oauth-authorization-server`),
    );
    assert.ok(as);
    assert.equal(as.status, 200);
    const asBody = (await as.json()) as { token_endpoint: string };
    assert.equal(asBody.token_endpoint, `${ISSUER}/oauth/token`);
    const pr = handleOauthDiscovery(
      new Request(`${ISSUER}/.well-known/oauth-protected-resource/api/v1/mcp`),
    );
    assert.ok(pr);
    const prBody = (await pr!.json()) as { resource: string };
    assert.equal(prBody.resource, MCP);
  });

  it("hashes secrets so the raw code is not the lookup key", () => {
    const a = sha256Hex("oac_abc");
    const b = sha256Hex("oac_abc");
    assert.equal(a, b);
    assert.notEqual(a, "oac_abc");
    assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
  });
});

describe("privacy and consent copy contract", () => {
  it("keeps Human App locked lines and contact, without Meter or lab jargon", () => {
    const blob = [
      PRIVACY_HEADLINE,
      PRIVACY_KEEP_HEADING,
      PRIVACY_LEDE,
      PRIVACY_BODY,
      PRIVACY_CONTACT,
      CONSENT_EYEBROW,
      CONSENT_HEADLINE,
      CONSENT_LEDE,
      CONSENT_HUMAN_LINE,
      CONSENT_KEYS,
      CONSENT_ALLOW,
      CONSENT_WHAT_HEADING,
      CONSENT_APP_LABEL,
      CONSENT_REDIRECT_LABEL,
      CONSENT_LOOPBACK,
      ...CONSENT_WHAT,
    ].join(" ");
    assert.match(blob, /You stay the customer of record/);
    assert.match(blob, /You keep the keys/);
    assert.match(blob, /human principal/i);
    assert.match(blob, /Approval Inbox/);
    assert.match(blob, new RegExp(SUPPORT_EMAIL.replace(".", "\\.")));
    assert.doesNotMatch(blob, /Meter/);
    for (const re of BANNED_CUSTOMER) {
      assert.doesNotMatch(blob, re);
    }
  });

  it("ships /privacy with the five-step marketing type scale and sibling classes", () => {
    const privacy = read("src/routes/privacy.tsx");
    const consent = read("src/routes/oauth/authorize.tsx");
    const partners = read("src/routes/partners.tsx");
    assert.match(privacy, /createFileRoute\("\/privacy"\)/);
    assert.match(privacy, /text-meta font-medium uppercase tracking-\[0\.18em\] text-coral/);
    assert.match(privacy, /text-display font-semibold/);
    assert.match(privacy, /text-title font-semibold tracking-tight/);
    assert.match(privacy, /text-body text-muted">\{PRIVACY_LEDE\}/);
    assert.doesNotMatch(privacy, /text-card text-muted">\{PRIVACY_LEDE\}/);
    assert.match(privacy, /text-body text-muted/);
    assert.match(privacy, /SkyShell/);
    assert.match(partners, /text-display font-semibold/);
    assert.match(partners, /text-title font-semibold tracking-tight/);
    assert.match(consent, /text-display font-semibold/);
    assert.match(consent, /text-title font-semibold tracking-tight/);
    assert.match(consent, /text-body text-muted">\{CONSENT_LEDE\}/);
    assert.doesNotMatch(consent, /text-card text-muted">\{CONSENT_LEDE\}/);
    assert.match(consent, /CONSENT_APP_LABEL/);
    assert.match(consent, /CONSENT_REDIRECT_LABEL/);
    assert.match(consent, /client_name/);
    assert.match(consent, /redirect_uri/);
    assert.doesNotMatch(consent, /Allow Claude/);
    const registerRoute = read("src/routes/oauth/register.ts");
    assert.match(registerRoute, /consumeRegisterSlot/);
    assert.match(registerRoute, /\b429\b/);
    const scrub = read("migrations/0023_oauth_dcr_redirect_scrub.sql");
    assert.match(scrub, /oc_1bU6z8SaoeoRlStOJl0oTrWwwP-CnlWYmJNUYx2kwws/);
    assert.match(scrub, /oc_dmurdNaX9cvvH8Q1iidwwgOIA27OTihm/);
    assert.match(scrub, /oc_eHzS8tel4nLCf6ubDGRONJFuTuAO3Ygf/);
    assert.match(scrub, /oauth_access_tokens/);
    assert.match(scrub, /oauth_auth_codes/);
    assert.match(scrub, /https:\/\/claude\.ai\/api\/mcp\/auth_callback/);
    assert.match(consent, /text-body text-muted/);
    assert.doesNotMatch(privacy, /text-\[\d+px\]/);
    assert.doesNotMatch(consent, /text-\[\d+px\]/);
    assert.doesNotMatch(privacy, /poll_url|must_abort|\babort\b/i);
    assert.doesNotMatch(consent, /poll_url|must_abort|\babort\b/i);
    assert.doesNotMatch(privacy, /Agent Meter|X-Agent-Pass/);
    assert.doesNotMatch(consent, /Agent Meter|X-Agent-Pass/);
  });

  it("links privacy from the footer and sitemap", () => {
    const chrome = read("src/components/marketing/chrome.tsx");
    const sitemap = read("public/sitemap.xml");
    assert.match(chrome, /href=["']\/privacy["']/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/privacy<\/loc>/);
  });
});
