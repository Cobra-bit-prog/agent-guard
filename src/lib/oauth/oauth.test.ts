import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONSENT_ALLOW,
  CONSENT_EYEBROW,
  CONSENT_HEADLINE,
  CONSENT_HUMAN_LINE,
  CONSENT_KEYS,
  CONSENT_LEDE,
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
import { authorizationServerMetadata, oauthWwwAuthenticate, protectedResourceMetadata } from "./metadata.ts";
import {
  checkAuthorizeRequest,
  completeAuthorize,
  denyAuthorize,
  exchangeToken,
  mcpResourceUrl,
  registerClient,
} from "./protocol.ts";
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
    const as = handleOauthDiscovery(new Request(`${ISSUER}/.well-known/oauth-authorization-server`));
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
