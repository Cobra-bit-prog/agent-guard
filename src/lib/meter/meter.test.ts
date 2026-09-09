import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateTransfer } from "../policy.ts";
import { SCAN_SINK_FIXTURE } from "./denylist.ts";
import { handleMeterRequest } from "./http.ts";
import { evaluatePreflightSelf } from "./preflight.ts";
import { evaluateScan } from "./scan.ts";
import { createMeterStore } from "./store.ts";

const ORIGIN = "https://agent-control.net";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return new Request(`${ORIGIN}${path}`, { method: "GET" });
}

describe("scan heuristics", () => {
  it("marks the fixture sink", () => {
    const out = evaluateScan({ address: SCAN_SINK_FIXTURE, chain: "solana" });
    assert.equal(out.risk, "sink");
    assert.match(out.reason, /listed_sink/);
  });

  it("marks unknown addresses as new / no_history", () => {
    const out = evaluateScan({ address: "UnknownWallet111111111111111111111111111", chain: "base" });
    assert.equal(out.risk, "new");
    assert.match(out.reason, /no_history/);
  });
});

describe("preflight-self", () => {
  it("stops when value exceeds cap", () => {
    const out = evaluatePreflightSelf({ cap_usd: 20, value_usd: 30, spent_today_usd: 0 });
    assert.equal(out.decision, "stop");
    assert.equal(out.must_abort, true);
  });

  it("allows a small value under cap", () => {
    const out = evaluatePreflightSelf({ cap_usd: 20, value_usd: 5, spent_today_usd: 0 });
    assert.equal(out.decision, "allow");
    assert.equal(out.must_abort, false);
    assert.equal(out.remaining_usd, 15);
  });
});

describe("meter http", () => {
  it("returns 402 for scan without a pass", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }),
      "/api/v1/meter/scan",
      store,
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "payment_required");
    assert.equal(store.pendingApprovalsCreated, 0);
  });

  it("scans a sink after a dev pass", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(issued.status, 200);
    const pass = (await issued.json()) as { token: string };
    const res = await handleMeterRequest(
      post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }, { "X-Agent-Pass": pass.token }),
      "/api/v1/meter/scan",
      store,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { risk: string; pass_remaining_calls: number };
    assert.equal(body.risk, "sink");
    assert.equal(body.pass_remaining_calls, 199);
    process.env.NODE_ENV = prev;
  });

  it("scans unknown as new", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const res = await handleMeterRequest(
      post(
        "/api/v1/meter/scan",
        { chain: "ethereum", address: "0x1111111111111111111111111111111111111111" },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/scan",
      store,
    );
    const body = (await res.json()) as { risk: string; reason: string };
    assert.equal(body.risk, "new");
    assert.match(body.reason, /no_history/);
  });

  it("preflight 30 over cap 20 stops", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const res = await handleMeterRequest(
      post(
        "/api/v1/meter/preflight",
        { chain: "solana", wallet: "Agent111", to: "Shop111", value_usd: 30, cap_usd: 20 },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/preflight",
      store,
    );
    const body = (await res.json()) as { decision: string; must_abort: boolean };
    assert.equal(body.decision, "stop");
    assert.equal(body.must_abort, true);
  });

  it("preflight 5 under cap 20 allows", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const res = await handleMeterRequest(
      post(
        "/api/v1/meter/preflight",
        { chain: "base", wallet: "Agent222", to: "Shop222", value_usd: 5, cap_usd: 20 },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/preflight",
      store,
    );
    const body = (await res.json()) as { decision: string; remaining_usd: number };
    assert.equal(body.decision, "allow");
    assert.equal(body.remaining_usd, 15);
  });

  it("second preflight that exceeds cap using allow-log stops", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const first = await handleMeterRequest(
      post(
        "/api/v1/meter/preflight",
        { chain: "solana", wallet: "Agent333", to: "ShopA", value_usd: 12, cap_usd: 20 },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/preflight",
      store,
    );
    assert.equal(((await first.json()) as { decision: string }).decision, "allow");
    const second = await handleMeterRequest(
      post(
        "/api/v1/meter/preflight",
        { chain: "solana", wallet: "Agent333", to: "ShopB", value_usd: 12, cap_usd: 20 },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/preflight",
      store,
    );
    const body = (await second.json()) as { decision: string; must_abort: boolean };
    assert.equal(body.decision, "stop");
    assert.equal(body.must_abort, true);
    assert.equal(store.pendingApprovalsCreated, 0);
  });

  it("exhausted or expired pass returns 402", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = store.issuePass();
    issued.pass.included_calls = 1;
    issued.pass.used_calls = 1;
    const res = await handleMeterRequest(
      post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }, { "X-Agent-Pass": issued.token }),
      "/api/v1/meter/scan",
      store,
    );
    assert.equal(res.status, 402);
  });

  it("pricing is public", async () => {
    const res = await handleMeterRequest(get("/api/v1/meter/pricing"), "/api/v1/meter/pricing", createMeterStore());
    assert.equal(res.status, 200);
    const body = (await res.json()) as { product: string; pass: { price_usd: number } };
    assert.equal(body.product, "Agent Meter");
    assert.equal(body.pass.price_usd, 0.25);
  });
});

describe("human app isolation", () => {
  it("human policy check can still hold; meter preflight never holds", () => {
    const human = evaluateTransfer({
      valueUsd: 50,
      to: "NewDest",
      usedTodayUsd: 0,
      txsLastHour: 0,
      paused: false,
      policy: {
        daily_limit_usd: 100,
        max_tx_amount_usd: 10,
        alert_threshold_usd: 80,
        allowlist: ["only-this"],
        denylist: [],
        max_hourly_txs: 20,
      },
    });
    assert.equal(human.action, "hold");
    const meter = evaluatePreflightSelf({ cap_usd: 100, value_usd: 50, spent_today_usd: 0 });
    assert.notEqual(meter.decision, "hold" as string);
    assert.equal(meter.decision, "allow");
  });
});
