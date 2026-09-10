import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  acceptAllowsHtml,
  isApiPath,
  NOT_ACCEPTABLE_BODY,
  notAcceptableResponse,
  shouldSoftReject,
} from "./soft-accept.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STREAMABLE = "application/json, text/event-stream";

test("acceptAllowsHtml matches Start executeRouter (html, */*, missing)", () => {
  assert.equal(acceptAllowsHtml("text/html"), true);
  assert.equal(acceptAllowsHtml("text/html,application/xhtml+xml"), true);
  assert.equal(acceptAllowsHtml("text/html;q=0.9"), true);
  assert.equal(acceptAllowsHtml("*/*"), true);
  assert.equal(acceptAllowsHtml("*/*;q=0.8"), true);
  assert.equal(acceptAllowsHtml(""), true);
  assert.equal(acceptAllowsHtml(null), true);
  assert.equal(acceptAllowsHtml(undefined), true);
});

test("acceptAllowsHtml rejects JSON / SSE-only Accept (the 500 trigger)", () => {
  assert.equal(acceptAllowsHtml("application/json"), false);
  assert.equal(acceptAllowsHtml(STREAMABLE), false);
  assert.equal(acceptAllowsHtml("text/event-stream"), false);
  assert.equal(acceptAllowsHtml("application/json, text/event-stream"), false);
  assert.equal(acceptAllowsHtml("text/markdown"), false);
});

test("isApiPath covers /api and nested API routes only", () => {
  assert.equal(isApiPath("/api"), true);
  assert.equal(isApiPath("/api/v1/mcp"), true);
  assert.equal(isApiPath("/api/v1/check"), true);
  assert.equal(isApiPath("/api/auth/get-session"), true);
  assert.equal(isApiPath("/"), false);
  assert.equal(isApiPath("/docs"), false);
  assert.equal(isApiPath("/dashboard"), false);
  assert.equal(isApiPath("/apples"), false);
});

test("shouldSoftReject: browser HTML on / is allowed", () => {
  assert.equal(
    shouldSoftReject({ method: "GET", pathname: "/", accept: "text/html" }),
    false,
  );
});

test("shouldSoftReject: JSON / Streamable Accept on page routes", () => {
  for (const pathname of ["/", "/docs", "/dashboard", "/___server", "/.well-known/mcp.json", "/mcp.json", "/agents.json"]) {
    assert.equal(
      shouldSoftReject({ method: "GET", pathname, accept: "application/json" }),
      true,
      pathname,
    );
    assert.equal(
      shouldSoftReject({ method: "GET", pathname, accept: STREAMABLE }),
      true,
      pathname,
    );
    assert.equal(
      shouldSoftReject({ method: "HEAD", pathname, accept: STREAMABLE }),
      true,
      pathname,
    );
  }
});

test("shouldSoftReject: leaves /api/v1/mcp and other API routes alone", () => {
  assert.equal(
    shouldSoftReject({ method: "GET", pathname: "/api/v1/mcp", accept: STREAMABLE }),
    false,
  );
  assert.equal(
    shouldSoftReject({ method: "POST", pathname: "/api/v1/mcp", accept: STREAMABLE }),
    false,
  );
  assert.equal(
    shouldSoftReject({ method: "GET", pathname: "/api/v1/check", accept: "application/json" }),
    false,
  );
  assert.equal(
    shouldSoftReject({ method: "POST", pathname: "/api/v1/check", accept: "application/json" }),
    false,
  );
});

test("shouldSoftReject: leaves Claude OAuth discovery and token/register JSON alone", () => {
  assert.equal(
    shouldSoftReject({
      method: "GET",
      pathname: "/.well-known/oauth-authorization-server",
      accept: "application/json",
    }),
    false,
  );
  assert.equal(
    shouldSoftReject({
      method: "GET",
      pathname: "/.well-known/oauth-protected-resource/api/v1/mcp",
      accept: "application/json",
    }),
    false,
  );
  assert.equal(
    shouldSoftReject({ method: "POST", pathname: "/oauth/token", accept: "application/json" }),
    false,
  );
  assert.equal(
    shouldSoftReject({ method: "GET", pathname: "/oauth/register", accept: "application/json" }),
    false,
  );
});

test("shouldSoftReject: POST server-fn traffic is not intercepted", () => {
  assert.equal(
    shouldSoftReject({
      method: "POST",
      pathname: "/___server",
      accept: "application/json",
    }),
    false,
  );
});

test("shouldSoftReject: PWA internals stay on grok-pwa middleware", () => {
  assert.equal(
    shouldSoftReject({
      method: "GET",
      pathname: "/__grok/manifest.webmanifest",
      accept: "application/manifest+json",
    }),
    false,
  );
});

test("notAcceptableResponse is 406 JSON, never 500", () => {
  const response = notAcceptableResponse();
  assert.equal(response.status, 406);
  assert.notEqual(response.status, 500);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(NOT_ACCEPTABLE_BODY, '{"error":"Not Acceptable"}');
});

test("nitro middleware and vite plugin stay wired", () => {
  const viteConfig = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /softAcceptPlugin\(\)/);

  const middleware = readFileSync(join(ROOT, "server/middleware/soft-accept.ts"), "utf8");
  assert.match(middleware, /shouldSoftReject/);
  assert.match(middleware, /notAcceptableResponse/);
  assert.doesNotMatch(middleware, /api\/v1\/mcp/);

  const plugin = readFileSync(join(ROOT, "scripts/soft-accept-plugin.mjs"), "utf8");
  assert.match(plugin, /shouldSoftReject/);
  assert.match(plugin, /configureServer/);
});
