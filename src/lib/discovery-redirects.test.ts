import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCOVERY_REDIRECTS,
  LLMS_TXT_PATH,
  LLMS_WELL_KNOWN_PATH,
  handleDiscoveryRedirect,
  isDiscoveryRedirectPath,
  locationWithSearch,
} from "./discovery-redirects.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "https://agent-control.net";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function hit(path: string, method = "GET") {
  return handleDiscoveryRedirect(new Request(`${ORIGIN}${path}`, { method }));
}

describe("discovery path redirects", () => {
  it("maps the four dead URLs to live doors", () => {
    assert.deepEqual(
      DISCOVERY_REDIRECTS.map((rule) => [rule.source, rule.destination, rule.status, rule.permanent]),
      [
        ["/docs/connect", "/connect", 308, true],
        ["/pay", "/billing/pay", 308, true],
        ["/meter", "/connect#agent-meter", 307, false],
        [LLMS_WELL_KNOWN_PATH, LLMS_TXT_PATH, 308, true],
      ],
    );
  });

  it("308s /docs/connect to /connect", () => {
    const res = hit("/docs/connect");
    assert.ok(res);
    assert.equal(res.status, 308);
    assert.equal(res.headers.get("location"), "/connect");
  });

  it("308s /pay to /billing/pay and keeps the query string", () => {
    const bare = hit("/pay");
    assert.ok(bare);
    assert.equal(bare.status, 308);
    assert.equal(bare.headers.get("location"), "/billing/pay");

    const withQuery = hit("/pay?plan=starter&id=pay_1");
    assert.ok(withQuery);
    assert.equal(withQuery.status, 308);
    assert.equal(withQuery.headers.get("location"), "/billing/pay?plan=starter&id=pay_1");
  });

  it("soft-redirects /meter to the Agent Meter door until PR #43", () => {
    const res = hit("/meter");
    assert.ok(res);
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), "/connect#agent-meter");
    assert.equal(isDiscoveryRedirectPath("/meter/pay"), false);
    assert.equal(hit("/meter/pay"), null);
  });

  it("308s /.well-known/llms.txt to /llms.txt", () => {
    const res = hit(LLMS_WELL_KNOWN_PATH);
    assert.ok(res);
    assert.equal(res.status, 308);
    assert.equal(res.headers.get("location"), LLMS_TXT_PATH);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");

    const options = hit(LLMS_WELL_KNOWN_PATH, "OPTIONS");
    assert.ok(options);
    assert.equal(options.status, 204);
  });

  it("leaves live doors and meter APIs alone", () => {
    assert.equal(hit("/connect"), null);
    assert.equal(hit("/billing/pay?plan=starter"), null);
    assert.equal(hit("/llms.txt"), null);
    assert.equal(hit("/docs"), null);
    assert.equal(hit("/.well-known/x402"), null);
    assert.equal(hit("/api/v1/meter/pricing"), null);
  });

  it("places search before a hash fragment", () => {
    assert.equal(locationWithSearch("/connect#agent-meter", "?ref=1"), "/connect?ref=1#agent-meter");
    assert.equal(locationWithSearch("/billing/pay", "?plan=starter"), "/billing/pay?plan=starter");
    assert.equal(locationWithSearch("/connect", ""), "/connect");
  });
});

describe("discovery redirects stay wired", () => {
  it("mirrors the table in vercel.json", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects: Array<{ source: string; destination: string; permanent?: boolean }>;
    };
    for (const rule of DISCOVERY_REDIRECTS) {
      const row = vercel.redirects.find((item) => item.source === rule.source);
      assert.ok(row, `missing vercel redirect for ${rule.source}`);
      assert.equal(row.destination, rule.destination);
      assert.equal(row.permanent, rule.permanent);
    }
  });

  it("does not ship a /meter visualization page", () => {
    const routes = read("src/routes/meter.pay.tsx");
    assert.match(routes, /createFileRoute\("\/meter\/pay"\)/);
    assert.doesNotMatch(read("src/routeTree.gen.ts"), /createFileRoute\("\/meter"\)/);
    assert.doesNotMatch(read("src/routes/index.tsx"), /Agent Meter/);
  });

  it("keeps Vite and Nitro on the same handler", () => {
    const vite = read("vite.config.ts");
    const nitro = read("server/middleware/oauth-discovery.ts");
    assert.match(vite, /handleDiscoveryRedirect/);
    assert.match(nitro, /handleDiscoveryRedirect/);
    assert.match(nitro, /handleMeterWellKnown/);
  });
});
