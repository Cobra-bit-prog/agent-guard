import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAMP_ID_HEADER as ADAPTER_STAMP_HEADER,
  STAMP_TX_PRICE_USD,
  merchantStampRequiredBody,
  readMerchantStampId,
  requireMerchantStamp,
  stampViewAllows,
  verifyMerchantStamp,
  type StampFetch,
} from "../../adapters/stamp-gate.ts";
import { STAMP_ID_HEADER } from "../meter-recipe.ts";
import { METER_STAMP_TX } from "./pricing.ts";
import { handleMeterRequest } from "./http.ts";
import { handleStampGate } from "./gate.ts";
import { STAMP_FETCH_ORIGIN_HASH_LEN, isStampFetchProbe, isStampFetchSmoke } from "./stamp-fetch.ts";
import { createMeterStore, type MeterStore, type StampFetchRow } from "./store.ts";

const ORIGIN = "https://agent-control.net";
const GATE = "/api/v1/gate/demo";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function gateGet(headers: Record<string, string> = {}, search = "") {
  return new Request(`${ORIGIN}${GATE}${search}`, { method: "GET", headers });
}

async function mintStamp(store: MeterStore, decision: "allow" | "stop") {
  const issued = await handleMeterRequest(
    post("/api/v1/meter/pass", { sku: "stamp_tx", proof: { type: "dev" } }),
    "/api/v1/meter/pass",
    store,
  );
  assert.equal(issued.status, 200);
  const pass = (await issued.json()) as { token: string };
  const stamp = await handleMeterRequest(
    post(
      "/api/v1/meter/stamp",
      { decision, chain: "solana", to: "Merchant" },
      { "X-Agent-Pass": pass.token },
    ),
    "/api/v1/meter/stamp",
    store,
  );
  assert.equal(stamp.status, 200);
  return (await stamp.json()) as {
    stamp_id: string;
    verified: boolean;
    decision: string;
    hmac: string;
    pass_id?: string;
    wallet?: string | null;
  };
}

describe("dogfood stamp gate", () => {
  it("blocks a missing stamp with 402 stamp_tx and does not mint an invoice", async () => {
    const store = createMeterStore();
    const res = await handleStampGate(gateGet(), store);
    assert.equal(res.status, 402);
    const body = (await res.json()) as {
      error: string;
      ok: boolean;
      reason: string;
      sku: string;
      price_usd: number;
      header: string;
      gate: string;
      invoice_id?: string;
      pricing: string;
      stamp_txt: string;
      next: string;
    };
    assert.equal(body.error, "payment_required");
    assert.equal(body.ok, false);
    assert.equal(body.reason, "missing");
    assert.equal(body.sku, "stamp_tx");
    assert.equal(body.price_usd, 0.05);
    assert.equal(body.price_usd, METER_STAMP_TX.price_usd);
    assert.equal(body.price_usd, STAMP_TX_PRICE_USD);
    assert.equal(body.header, "X-Stamp-Id");
    assert.equal(body.gate, "demo");
    assert.equal(body.invoice_id, undefined);
    assert.match(body.pricing, /\/api\/v1\/meter\/pricing$/);
    assert.match(body.stamp_txt, /\/stamp\.txt$/);
    assert.match(body.next, /stamp_tx \$0\.05/);
    assert.match(body.next, /X-Stamp-Id/);
    assert.match(res.headers.get("WWW-Authenticate") ?? "", /sku="stamp_tx"/);
    assert.equal(res.headers.get("PAYMENT-REQUIRED"), null);
    assert.equal((await store.report()).invoices_created, 0);
  });

  it("opens on a verified allow stamp and stays shut for stop, unknown, invalid, and query-only", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const allow = await mintStamp(store, "allow");
    assert.equal(allow.verified, true);
    assert.equal(allow.decision, "allow");

    const open = await handleStampGate(gateGet({ "X-Stamp-Id": allow.stamp_id }), store);
    assert.equal(open.status, 200);
    const opened = (await open.json()) as Record<string, unknown>;
    assert.deepEqual(opened, {
      ok: true,
      gate: "demo",
      message: "Stamp allow. Gate open.",
      stamp_id: allow.stamp_id,
    });
    const serialized = JSON.stringify(opened);
    assert.doesNotMatch(serialized, /hmac|token|pass_id|wallet|secret/i);

    const posted = await handleStampGate(
      post(GATE, {}, { "X-Stamp-Id": allow.stamp_id }),
      store,
    );
    assert.equal(posted.status, 200);

    const queryOnly = await handleStampGate(gateGet({}, `?stamp_id=${allow.stamp_id}`), store);
    assert.equal(queryOnly.status, 402);
    assert.equal(((await queryOnly.json()) as { reason: string }).reason, "missing");

    const stop = await mintStamp(store, "stop");
    const stopped = await handleStampGate(gateGet({ "X-Stamp-Id": stop.stamp_id }), store);
    assert.equal(stopped.status, 402);
    assert.equal(((await stopped.json()) as { reason: string }).reason, "stop");

    const unknown = await handleStampGate(gateGet({ "X-Stamp-Id": "stamp_missing" }), store);
    assert.equal(unknown.status, 402);
    assert.equal(((await unknown.json()) as { reason: string }).reason, "unknown");

    await store.saveStamp({
      id: "stamp_badhmac",
      pass_id: "pass_x",
      decision: "allow",
      chain: "solana",
      wallet: null,
      address: null,
      value_usd: null,
      hmac: "00".repeat(32),
      created_at: new Date().toISOString(),
    });
    const invalid = await handleStampGate(gateGet({ "X-Stamp-Id": "stamp_badhmac" }), store);
    assert.equal(invalid.status, 402);
    assert.equal(((await invalid.json()) as { reason: string }).reason, "invalid");

    const blank = await handleStampGate(gateGet({ "X-Stamp-Id": "   " }), store);
    assert.equal(blank.status, 402);
    assert.equal(((await blank.json()) as { reason: string }).reason, "missing");
  });
});

describe("merchant stamp helper", () => {
  it("keeps the header contract aligned with the seller recipe", () => {
    assert.equal(ADAPTER_STAMP_HEADER, STAMP_ID_HEADER);
    assert.equal(ADAPTER_STAMP_HEADER, "X-Stamp-Id");
    const file = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../adapters/stamp-gate.ts"),
      "utf8",
    );
    assert.match(file, /GET \/api\/v1\/meter\/stamp/);
    assert.doesNotMatch(file, /from ["']@\//);
    assert.doesNotMatch(file, /from ["']\.\.\/lib/);
  });

  it("allows only a verified allow view", () => {
    assert.equal(stampViewAllows({ verified: true, decision: "allow" }), "allow");
    assert.equal(stampViewAllows({ verified: true, decision: "stop" }), "stop");
    assert.equal(stampViewAllows({ verified: false, decision: "allow" }), "invalid");
    assert.equal(stampViewAllows(null), "invalid");
    assert.equal(
      stampViewAllows(
        { verified: true, decision: "allow", expires_at: "2000-01-01T00:00:00.000Z" },
        Date.parse("2020-01-01T00:00:00.000Z"),
      ),
      "expired",
    );
    assert.equal(
      stampViewAllows(
        { verified: true, decision: "allow", expires_at: "2099-01-01T00:00:00.000Z" },
        Date.parse("2020-01-01T00:00:00.000Z"),
      ),
      "allow",
    );
  });

  it("verifies over GET /api/v1/meter/stamp/:id and rejects missing, unknown, stop, and expired", async () => {
    const calls: string[] = [];
    const fetchImpl: StampFetch = async (url) => {
      calls.push(url);
      if (url.endsWith("/stamp_allow")) {
        return Response.json({ stamp_id: "stamp_allow", verified: true, decision: "allow" });
      }
      if (url.endsWith("/stamp_stop")) {
        return Response.json({ stamp_id: "stamp_stop", verified: true, decision: "stop" });
      }
      if (url.endsWith("/stamp_bad")) {
        return Response.json({ stamp_id: "stamp_bad", verified: false, decision: "allow" });
      }
      if (url.endsWith("/stamp_old")) {
        return Response.json({
          stamp_id: "stamp_old",
          verified: true,
          decision: "allow",
          expires_at: "2000-01-01T00:00:00.000Z",
        });
      }
      return Response.json({ error: "unknown_stamp" }, { status: 404 });
    };
    const opts = { origin: ORIGIN, fetch: fetchImpl, nowMs: Date.parse("2020-01-01T00:00:00.000Z") };

    const missing = await requireMerchantStamp(gateGet(), opts);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 402);
      assert.equal(missing.body.reason, "missing");
      assert.equal(missing.body.sku, "stamp_tx");
      assert.deepEqual(missing.body, merchantStampRequiredBody("missing"));
    }
    assert.equal(calls.length, 0);

    const allow = await requireMerchantStamp(gateGet({ "X-Stamp-Id": "stamp_allow" }), opts);
    assert.deepEqual(allow, { ok: true, stamp_id: "stamp_allow", decision: "allow" });
    assert.equal(calls[0], `${ORIGIN}/api/v1/meter/stamp/stamp_allow`);

    const stop = await verifyMerchantStamp("stamp_stop", opts);
    assert.deepEqual(stop, { state: "stop" });
    const unknown = await verifyMerchantStamp("stamp_nope", opts);
    assert.deepEqual(unknown, { state: "unknown" });
    const invalid = await verifyMerchantStamp("stamp_bad", opts);
    assert.deepEqual(invalid, { state: "invalid" });
    const expired = await verifyMerchantStamp("stamp_old", opts);
    assert.deepEqual(expired, { state: "expired" });

    const thrown = await verifyMerchantStamp("stamp_down", {
      ...opts,
      fetch: async () => {
        throw new Error("network");
      },
    });
    assert.deepEqual(thrown, { state: "unknown" });
  });

  it("sends X-Seller and labels the 402 gate with the seller or merchant", async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetchImpl: StampFetch = async (url, init) => {
      calls.push({ url, headers: init?.headers });
      if (url.endsWith("/stamp_allow")) {
        return Response.json({ stamp_id: "stamp_allow", verified: true, decision: "allow" });
      }
      return Response.json({ error: "unknown_stamp" }, { status: 404 });
    };
    const opts = { origin: ORIGIN, fetch: fetchImpl };

    const named = await requireMerchantStamp(gateGet(), { ...opts, seller: "your-slug" });
    assert.equal(named.ok, false);
    if (!named.ok) assert.equal(named.body.gate, "your-slug");

    const plain = await requireMerchantStamp(gateGet(), opts);
    assert.equal(plain.ok, false);
    if (!plain.ok) assert.equal(plain.body.gate, "merchant");

    const allow = await requireMerchantStamp(gateGet({ "X-Stamp-Id": "stamp_allow" }), {
      ...opts,
      seller: "Your-Slug",
    });
    assert.equal(allow.ok, true);
    assert.equal(calls.at(-1)?.headers?.["X-Seller"], "your-slug");

    calls.length = 0;
    await verifyMerchantStamp("stamp_allow", { ...opts, seller: "not a slug" });
    assert.equal(calls[0]?.headers, undefined);

    const badLabel = await requireMerchantStamp(gateGet(), { ...opts, seller: "not a slug" });
    assert.equal(badLabel.ok, false);
    if (!badLabel.ok) assert.equal(badLabel.body.gate, "not a slug");
  });

  it("reads x-stamp-id from an Express headers object", async () => {
    const fetchImpl: StampFetch = async (url) => {
      if (url.endsWith("/stamp_allow")) {
        return Response.json({ stamp_id: "stamp_allow", verified: true, decision: "allow" });
      }
      if (url.endsWith("/stamp_stop")) {
        return Response.json({ stamp_id: "stamp_stop", verified: true, decision: "stop" });
      }
      return Response.json({ error: "unknown_stamp" }, { status: 404 });
    };
    const opts = { origin: ORIGIN, fetch: fetchImpl, seller: "your-slug" };

    const allow = await requireMerchantStamp(
      { headers: { "x-stamp-id": ["stamp_allow", "ignored"] } },
      opts,
    );
    assert.deepEqual(allow, { ok: true, stamp_id: "stamp_allow", decision: "allow" });

    const missing = await requireMerchantStamp({ headers: { host: "shop.example" } }, opts);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 402);
      assert.equal(missing.body.reason, "missing");
      assert.equal(missing.body.gate, "your-slug");
    }

    const denied = await requireMerchantStamp({ headers: { "x-stamp-id": ["stamp_stop"] } }, opts);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 402);
      assert.equal(denied.body.reason, "stop");
    }

    assert.equal(readMerchantStampId({ headers: { "x-stamp-id": " stamp_allow " } }), "stamp_allow");
  });
});

const LIVE_UA = "MeterClient/1.0";

async function withLiveFetchEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = {
    NODE_ENV: process.env.NODE_ENV,
    CI: process.env.CI,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  process.env.NODE_ENV = "production";
  delete process.env.CI;
  delete process.env.VERCEL_ENV;
  try {
    return await fn();
  } finally {
    restoreEnv("NODE_ENV", prev.NODE_ENV);
    restoreEnv("CI", prev.CI);
    restoreEnv("VERCEL_ENV", prev.VERCEL_ENV);
  }
}

function restoreEnv(key: "NODE_ENV" | "CI" | "VERCEL_ENV", value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function stampGet(id: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/v1/meter/stamp/${id}`, {
    method: "GET",
    headers: { "user-agent": LIVE_UA, ...headers },
  });
}

describe("stamp fetch scoreboard", () => {
  it("reuses invoice smoke signals and treats test, CI, and dev as smoke", async () => {
    await withLiveFetchEnv(async () => {
      const real = stampGet("stamp_x");
      assert.equal(isStampFetchSmoke(real), false);
      assert.equal(isStampFetchSmoke(stampGet("stamp_x", { "user-agent": "curl/8.5.0" })), true);
      assert.equal(isStampFetchSmoke(stampGet("stamp_x", { "x-meter-smoke": "1" })), true);
      assert.equal(
        isStampFetchSmoke(
          new Request("http://localhost:8080/api/v1/meter/stamp/stamp_x", {
            headers: { "user-agent": LIVE_UA },
          }),
        ),
        true,
      );
      process.env.NODE_ENV = "test";
      assert.equal(isStampFetchSmoke(real), true);
      process.env.NODE_ENV = "production";
      process.env.CI = "true";
      assert.equal(isStampFetchSmoke(real), true);
      delete process.env.CI;
      process.env.NODE_ENV = "development";
      assert.equal(isStampFetchSmoke(real), true);
    });
  });

  it("verify writes source, result, and seller without changing the body", async () => {
    await withLiveFetchEnv(async () => {
      process.env.NODE_ENV = "test";
      const store = createMeterStore();
      const allow = await mintStamp(store, "allow");
      process.env.NODE_ENV = "production";

      const origin = "https://shop.example";
      const res = await handleMeterRequest(
        stampGet(allow.stamp_id, {
          "x-seller": "Acme",
          origin,
          "cf-connecting-ip": "203.0.113.9",
        }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.stamp_id, allow.stamp_id);
      assert.equal(body.verified, true);
      assert.equal(body.decision, "allow");
      assert.equal(body.seller, undefined);
      assert.equal(body.is_smoke, undefined);

      const rows = await store.listStampFetches();
      assert.equal(rows.length, 1);
      const row = rows[0] as StampFetchRow;
      assert.equal(row.source, "verify");
      assert.equal(row.result, "allow");
      assert.equal(row.seller, "acme");
      assert.equal(row.is_smoke, false);
      assert.equal(row.is_probe, false);
      assert.equal(row.stamp_id, allow.stamp_id);
      const expectedHash = createHash("sha256")
        .update(origin)
        .digest("hex")
        .slice(0, STAMP_FETCH_ORIGIN_HASH_LEN);
      assert.equal(row.origin_hash, expectedHash);
      assert.equal(JSON.stringify(row).includes("203.0.113.9"), false);

      const report = await store.report();
      assert.equal(report.tickets_fetched_by_seller, 1);
      assert.equal(report.stamp_fetches_total, 1);
      assert.equal(report.stamp_fetches_smoke, 0);
    });
  });

  it("probe verify is stored and excluded from tickets_fetched_by_seller", async () => {
    await withLiveFetchEnv(async () => {
      process.env.NODE_ENV = "test";
      const store = createMeterStore();
      const allow = await mintStamp(store, "allow");
      process.env.NODE_ENV = "production";
      const probeUa = "CarbonMonitor/0.1 healthcheck (+https://carbon-cashmere.de)";
      assert.equal(isStampFetchProbe(stampGet(allow.stamp_id, { "user-agent": probeUa })), true);
      const res = await handleMeterRequest(
        stampGet(allow.stamp_id, { "user-agent": probeUa, "x-seller": "acme" }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );
      assert.equal(res.status, 200);
      const rows = await store.listStampFetches();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.source, "verify");
      assert.equal(rows[0]?.result, "allow");
      assert.equal(rows[0]?.seller, "acme");
      assert.equal(rows[0]?.is_probe, true);
      assert.equal(rows[0]?.is_smoke, false);
      const report = await store.report();
      assert.equal(report.tickets_fetched_by_seller, 0);
      assert.equal(report.stamp_fetches_total, 0);
      assert.equal(report.stamp_fetches_smoke, 0);
    });
  });

  it("gate writes source gate_demo and keeps gate demo", async () => {
    await withLiveFetchEnv(async () => {
      process.env.NODE_ENV = "test";
      const store = createMeterStore();
      const allow = await mintStamp(store, "allow");
      process.env.NODE_ENV = "production";

      const open = await handleStampGate(
        gateGet({ "X-Stamp-Id": allow.stamp_id, "X-Seller": "gamma", "user-agent": LIVE_UA }),
        store,
      );
      assert.equal(open.status, 200);
      assert.equal(((await open.json()) as { gate: string }).gate, "demo");

      const missing = await handleStampGate(gateGet({ "user-agent": LIVE_UA }), store);
      assert.equal(missing.status, 402);
      assert.equal(((await missing.json()) as { gate: string; reason: string }).gate, "demo");

      const rows = await store.listStampFetches();
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.source, "gate_demo");
      assert.equal(rows[0]?.result, "allow");
      assert.equal(rows[0]?.seller, "gamma");
      assert.equal(rows[1]?.source, "gate_demo");
      assert.equal(rows[1]?.result, "missing");
      assert.equal(rows[1]?.stamp_id, null);
    });
  });

  it("smoke fetches are stored and excluded from tickets_fetched_by_seller", async () => {
    await withLiveFetchEnv(async () => {
      process.env.NODE_ENV = "test";
      const store = createMeterStore();
      const allow = await mintStamp(store, "allow");
      const stop = await mintStamp(store, "stop");
      process.env.NODE_ENV = "production";

      const origin = "https://shop.example";
      await handleMeterRequest(
        stampGet(allow.stamp_id, { "x-seller": "acme", origin }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );
      await handleMeterRequest(
        stampGet(allow.stamp_id, { "x-seller": "acme", origin }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );
      await handleMeterRequest(
        stampGet("stamp_missing", { "x-seller": "beta", origin }),
        "/api/v1/meter/stamp/stamp_missing",
        store,
      );
      await handleMeterRequest(
        stampGet(stop.stamp_id, { origin }),
        `/api/v1/meter/stamp/${stop.stamp_id}`,
        store,
      );
      await store.saveStamp({
        id: "stamp_badhmac",
        pass_id: "pass_x",
        decision: "allow",
        chain: "solana",
        wallet: null,
        address: null,
        value_usd: null,
        hmac: "00".repeat(32),
        created_at: new Date().toISOString(),
      });
      await handleMeterRequest(
        stampGet("stamp_badhmac", { origin }),
        "/api/v1/meter/stamp/stamp_badhmac",
        store,
      );
      await handleStampGate(
        gateGet({
          "X-Stamp-Id": allow.stamp_id,
          "X-Seller": "gamma",
          "user-agent": LIVE_UA,
          origin,
        }),
        store,
      );
      await handleStampGate(gateGet({ "user-agent": LIVE_UA }), store);
      await handleMeterRequest(
        stampGet(allow.stamp_id, { "x-seller": "delta", origin }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
        { stampFetchSource: "mcp_verify" },
      );
      await handleMeterRequest(
        stampGet(allow.stamp_id, {
          "x-seller": "smoke-shop",
          "x-meter-smoke": "1",
          "user-agent": LIVE_UA,
          origin,
        }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );

      process.env.NODE_ENV = "test";
      await handleMeterRequest(
        stampGet(allow.stamp_id, { "x-seller": "ci-shop", origin }),
        `/api/v1/meter/stamp/${allow.stamp_id}`,
        store,
      );
      process.env.NODE_ENV = "production";

      const rows = await store.listStampFetches();
      const mcp = rows.find((row) => row.source === "mcp_verify");
      assert.equal(mcp?.result, "allow");
      assert.equal(mcp?.seller, "delta");
      assert.equal(mcp?.is_smoke, false);
      const headerSmoke = rows.find((row) => row.seller === "smoke-shop");
      assert.equal(headerSmoke?.is_smoke, true);
      assert.equal(headerSmoke?.result, "allow");
      const envSmoke = rows.find((row) => row.seller === "ci-shop");
      assert.equal(envSmoke?.is_smoke, true);
      const invalid = rows.find((row) => row.stamp_id === "stamp_badhmac");
      assert.equal(invalid?.result, "invalid");
      const stopped = rows.find((row) => row.stamp_id === stop.stamp_id && row.source === "verify");
      assert.equal(stopped?.result, "stop");

      const report = await store.report();
      assert.equal(report.tickets_fetched_by_seller, 3);
      assert.equal(report.stamp_fetches_total, 8);
      assert.equal(report.gate_demo_hits, 2);
      assert.equal(report.fetch_unique_sellers, 4);
      assert.equal(report.stamp_fetches_smoke, 2);
      assert.equal(report.invoices_created, 0);
      assert.equal(report.passes_issued >= 2, true);
      assert.equal(report.product, "Agent Meter");
    });
  });

  it("a failed store write does not break verify", async () => {
    await withLiveFetchEnv(async () => {
      const store = createMeterStore();
      store.recordStampFetch = async () => {
        throw new Error("db down");
      };
      const res = await handleMeterRequest(
        stampGet("stamp_missing", { "x-seller": "acme" }),
        "/api/v1/meter/stamp/stamp_missing",
        store,
      );
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: "unknown_stamp" });
    });
  });

  it("mcp verify is wired to source mcp_verify and forwards X-Seller", () => {
    const file = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../server/mcp-dispatch.ts"),
      "utf8",
    );
    assert.match(file, /meter_verify_stamp[\s\S]*"mcp_verify"/);
    assert.match(file, /"x-seller"/);
    assert.match(file, /"x-meter-smoke"/);
    assert.match(file, /meter_verify_stamp/);
  });
});
