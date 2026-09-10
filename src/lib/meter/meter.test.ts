import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAY_EXPIRY_MS } from "../solana-pay.ts";
import { evaluateTransfer } from "../policy.ts";
import { SCAN_SINK_FIXTURE } from "./denylist.ts";
import { handleInternalMeterInvoices, handleMeterRequest } from "./http.ts";
import {
  extractMeterInvoiceOrigin,
  hashMeterClientIp,
  meterInvoiceSourceForMcpTool,
  METER_USER_AGENT_MAX,
} from "./origin.ts";
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
    const issued = await store.issuePass();
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

describe("extra meter skus", () => {
  it("pricing.skus lists catalog ids and keeps pass_1h as default", async () => {
    const res = await handleMeterRequest(get("/api/v1/meter/pricing"), "/api/v1/meter/pricing", createMeterStore());
    const body = (await res.json()) as {
      default_sku: string;
      pass: { id: string; price_usd: number };
      skus: { id: string; price_usd: number }[];
      funds: { pay_to: string };
    };
    assert.equal(body.default_sku, "pass_1h");
    assert.equal(body.pass.id, "pass_1h");
    assert.equal(body.pass.price_usd, 0.25);
    assert.equal(body.skus.length, 5);
    assert.deepEqual(
      body.skus.map((row) => row.id),
      ["pass_1h", "pass_24h", "calls_1k", "stamp_tx", "scan_batch"],
    );
    assert.equal(body.funds.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
  });

  it("POST pass {} still invoices pass_1h $0.25", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(post("/api/v1/meter/pass", {}), "/api/v1/meter/pass", store);
    assert.equal(res.status, 402);
    const body = (await res.json()) as { sku: string; amount_usd: number; pay_to: string };
    assert.equal(body.sku, "pass_1h");
    assert.equal(body.amount_usd, 0.25);
    assert.equal(body.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
  });

  it("POST pass sku=pass_24h invoices $1", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "pass_24h" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as { sku: string; amount_usd: number; price_usd: number };
    assert.equal(body.sku, "pass_24h");
    assert.equal(body.amount_usd, 1);
    assert.equal(body.price_usd, 1);
  });

  it("fulfillInvoice mints the invoice sku, not always pass_1h", async () => {
    const store = createMeterStore();
    const invoice = await store.createInvoice({ sku: "pass_24h" });
    assert.equal(invoice.amount_usd, 1);
    const paid = await store.fulfillInvoice(invoice.invoice_id, { signature: "sig24", amountUsdc: 1 });
    assert.equal(paid.pass.sku, "pass_24h");
    assert.equal(paid.pass.included_calls, 2000);
    const ttlMs = Date.parse(paid.pass.expires_at) - Date.parse(paid.pass.created_at);
    assert.equal(ttlMs, 86400 * 1000);
  });

  it("unknown sku returns 400 without creating an invoice", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "not_a_sku" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; sku: string };
    assert.equal(body.error, "unknown_sku");
    assert.equal(body.sku, "not_a_sku");
    const report = await store.report();
    assert.equal(report.invoices_created, 0);
  });

  it("scan-batch and stamp work with a covering dev grant", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string; sku: string; included_calls: number };
    assert.equal(pass.sku, "pass_1h");
    assert.equal(pass.included_calls, 200);

    const batch = await handleMeterRequest(
      post(
        "/api/v1/meter/scan-batch",
        { chain: "solana", addresses: [SCAN_SINK_FIXTURE, "UnknownWallet111111111111111111111111111"] },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/scan-batch",
      store,
    );
    assert.equal(batch.status, 200);
    const batchBody = (await batch.json()) as {
      count: number;
      risk: string;
      results: { address: string; risk: string }[];
      pass_remaining_calls: number;
    };
    assert.equal(batchBody.count, 2);
    assert.equal(batchBody.risk, "sink");
    assert.equal(batchBody.results[0]?.risk, "sink");
    assert.equal(batchBody.results[1]?.risk, "new");
    assert.equal(batchBody.pass_remaining_calls, 199);

    const stamp = await handleMeterRequest(
      post(
        "/api/v1/meter/stamp",
        { chain: "solana", wallet: "AgentStamp", to: "ShopStamp", decision: "allow", value_usd: 5 },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/stamp",
      store,
    );
    assert.equal(stamp.status, 200);
    const stampBody = (await stamp.json()) as {
      stamp_id: string;
      decision: string;
      hmac: string;
      alg: string;
      verified: boolean;
    };
    assert.equal(stampBody.decision, "allow");
    assert.equal(stampBody.alg, "HMAC-SHA256");
    assert.equal(stampBody.verified, true);
    assert.match(stampBody.hmac, /^[a-f0-9]{64}$/);

    const fetched = await handleMeterRequest(
      get(`/api/v1/meter/stamp/${stampBody.stamp_id}`),
      `/api/v1/meter/stamp/${stampBody.stamp_id}`,
      store,
    );
    assert.equal(fetched.status, 200);
    const fetchedBody = (await fetched.json()) as { stamp_id: string; hmac: string; verified: boolean };
    assert.equal(fetchedBody.stamp_id, stampBody.stamp_id);
    assert.equal(fetchedBody.hmac, stampBody.hmac);
    assert.equal(fetchedBody.verified, true);
  });

  it("stamp_tx covers stamp but not scan-batch", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "stamp_tx", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string; sku: string; included_calls: number; covers: string[] };
    assert.equal(pass.sku, "stamp_tx");
    assert.equal(pass.included_calls, 1);
    assert.deepEqual(pass.covers, ["stamp"]);

    const denied = await handleMeterRequest(
      post(
        "/api/v1/meter/scan-batch",
        { chain: "solana", addresses: [SCAN_SINK_FIXTURE] },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/scan-batch",
      store,
    );
    assert.equal(denied.status, 402);
    const deniedBody = (await denied.json()) as { error: string; sku: string; kind: string };
    assert.equal(deniedBody.error, "sku_does_not_cover");
    assert.equal(deniedBody.sku, "stamp_tx");
    assert.equal(deniedBody.kind, "scan_batch");

    const stamp = await handleMeterRequest(
      post(
        "/api/v1/meter/stamp",
        { decision: "stop", chain: "solana", to: "Sink111" },
        { "X-Agent-Pass": pass.token },
      ),
      "/api/v1/meter/stamp",
      store,
    );
    assert.equal(stamp.status, 200);
    const stampBody = (await stamp.json()) as { decision: string; verified: boolean };
    assert.equal(stampBody.decision, "stop");
    assert.equal(stampBody.verified, true);
  });

  it("scan-batch without a pass is 402, not unknown_meter_route", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/scan-batch", { chain: "solana", addresses: [SCAN_SINK_FIXTURE] }),
      "/api/v1/meter/scan-batch",
      store,
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "payment_required");
  });
});

describe("invoice origin", { concurrency: false }, () => {
  const SECRET = "meter-origin-test-secret";

  function withStatsSecret<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = process.env.INTERNAL_STATS_SECRET;
    process.env.INTERNAL_STATS_SECRET = SECRET;
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        if (prev == null) delete process.env.INTERNAL_STATS_SECRET;
        else process.env.INTERNAL_STATS_SECRET = prev;
      });
  }

  it("hashes first-hop IPs and truncates user-agent", () => {
    const origin = extractMeterInvoiceOrigin(
      new Request("https://agent-control.net/api/v1/meter/pass?partner=Turnkey", {
        method: "POST",
        headers: {
          "user-agent": `UA${"x".repeat(400)}`,
          "cf-connecting-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.10, 70.41.3.18",
        },
      }),
      "http_pass",
      {},
      { INTERNAL_STATS_SECRET: SECRET },
    );
    assert.equal(origin.source, "http_pass");
    assert.equal(origin.partner, "turnkey");
    assert.equal(origin.user_agent?.length, METER_USER_AGENT_MAX);
    assert.equal(origin.cf_connecting_ip_hash, hashMeterClientIp("198.51.100.7", SECRET));
    assert.equal(origin.x_forwarded_for_hash, hashMeterClientIp("203.0.113.10", SECRET));
    assert.doesNotMatch(origin.cf_connecting_ip_hash ?? "", /198\.51\.100\.7/);
    assert.doesNotMatch(origin.x_forwarded_for_hash ?? "", /203\.0\.113\.10/);
  });

  it("persists http_pass metadata and ignores invalid partner", async () => {
    await withStatsSecret(async () => {
      const store = createMeterStore();
      const res = await handleMeterRequest(
        post(
          "/api/v1/meter/pass?partner=nope!",
          { partner: "AgentKit" },
          {
            "user-agent": "curl/8.0",
            "cf-connecting-ip": "198.51.100.20",
          },
        ),
        "/api/v1/meter/pass",
        store,
      );
      assert.equal(res.status, 402);
      const body = (await res.json()) as { invoice_id: string };
      const invoice = await store.getInvoice(body.invoice_id);
      assert.ok(invoice);
      assert.equal(invoice.source, "http_pass");
      assert.equal(invoice.user_agent, "curl/8.0");
      assert.equal(invoice.partner, "agentkit");
      assert.equal(invoice.cf_connecting_ip_hash, hashMeterClientIp("198.51.100.20", SECRET));
      assert.equal(invoice.x_forwarded_for_hash, null);
      const publicText = JSON.stringify(body);
      assert.doesNotMatch(publicText, /198\.51\.100\.20/);
      assert.doesNotMatch(publicText, /cf_connecting_ip_hash/);
    });
  });

  it("tags scan, preflight, scan-batch, stamp 402s and watch creates", async () => {
    await withStatsSecret(async () => {
      const store = createMeterStore();
      const scan = await handleMeterRequest(
        post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }),
        "/api/v1/meter/scan",
        store,
      );
      const scanBody = (await scan.json()) as { invoice_id: string };
      assert.equal((await store.getInvoice(scanBody.invoice_id))?.source, "http_scan");

      const pre = await handleMeterRequest(
        post("/api/v1/meter/preflight", { chain: "solana", wallet: "W", to: "T" }),
        "/api/v1/meter/preflight",
        store,
      );
      const preBody = (await pre.json()) as { invoice_id: string };
      assert.equal((await store.getInvoice(preBody.invoice_id))?.source, "http_preflight");

      const watch = await handleMeterRequest(
        post("/api/v1/meter/watch", {}),
        "/api/v1/meter/watch",
        store,
      );
      const watchBody = (await watch.json()) as { invoice_id: string };
      assert.equal((await store.getInvoice(watchBody.invoice_id))?.source, "http_watch");

      const batch = await handleMeterRequest(
        post("/api/v1/meter/scan-batch", { chain: "solana", addresses: [SCAN_SINK_FIXTURE] }),
        "/api/v1/meter/scan-batch",
        store,
      );
      const batchBody = (await batch.json()) as { invoice_id: string };
      assert.equal((await store.getInvoice(batchBody.invoice_id))?.source, "http_scan_batch");

      const stamp = await handleMeterRequest(
        post("/api/v1/meter/stamp", { decision: "allow", chain: "solana", to: "T" }),
        "/api/v1/meter/stamp",
        store,
      );
      const stampBody = (await stamp.json()) as { invoice_id: string };
      assert.equal((await store.getInvoice(stampBody.invoice_id))?.source, "http_stamp");
    });
  });

  it("tags MCP meter_buy_pass as mcp_buy_pass", async () => {
    assert.equal(meterInvoiceSourceForMcpTool("meter_buy_pass"), "mcp_buy_pass");
    assert.equal(meterInvoiceSourceForMcpTool("meter_watch"), undefined);
    const dispatch = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../server/mcp-dispatch.ts"),
      "utf8",
    );
    assert.match(dispatch, /meterInvoiceSourceForMcpTool/);
    assert.match(dispatch, /source: "mcp_buy_pass"|source = meterInvoiceSourceForMcpTool\(name\)/);
    assert.match(dispatch, /cf-connecting-ip/);
    assert.match(dispatch, /x-forwarded-for/);
    await withStatsSecret(async () => {
      const store = createMeterStore();
      const res = await handleMeterRequest(
        post(
          "/api/v1/meter/pass",
          { partner: "privy" },
          {
            "user-agent": "mcp-inspector/1",
            "x-forwarded-for": "203.0.113.55, 10.0.0.1",
          },
        ),
        "/api/v1/meter/pass",
        store,
        { source: "mcp_buy_pass" },
      );
      assert.equal(res.status, 402);
      const body = (await res.json()) as { invoice_id: string };
      const invoice = await store.getInvoice(body.invoice_id);
      assert.equal(invoice?.source, "mcp_buy_pass");
      assert.equal(invoice?.user_agent, "mcp-inspector/1");
      assert.equal(invoice?.partner, "privy");
      assert.equal(invoice?.x_forwarded_for_hash, hashMeterClientIp("203.0.113.55", SECRET));
      assert.equal(invoice?.cf_connecting_ip_hash, null);
    });
  });

  it("splits pending_fresh vs pending_stale so expired smokes do not inflate", async () => {
    const store = createMeterStore();
    store.createInvoice({ nowMs: Date.now() - PAY_EXPIRY_MS - 5_000 });
    store.createInvoice();
    const report = await store.report();
    assert.equal(report.invoices_created, 2);
    assert.equal(report.invoices_pending, 1);
    assert.equal(report.invoices_pending_fresh, 1);
    assert.equal(report.invoices_pending_stale, 1);
    assert.equal(report.usdc_pending_fresh, 0.25);
    assert.equal(report.usdc_pending_stale, 0.25);
  });

  it("internal invoice list returns 401 without the bearer secret", async () => {
    await withStatsSecret(async () => {
      const res = await handleInternalMeterInvoices(
        get("/api/v1/internal/meter/invoices"),
        createMeterStore(),
      );
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "Unauthorized");
    });
  });

  it("internal invoice list returns hashed origin fields and never plaintext IP", async () => {
    await withStatsSecret(async () => {
      const store = createMeterStore();
      await handleMeterRequest(
        post(
          "/api/v1/meter/pass?partner=x402",
          {},
          { "user-agent": "list-agent", "cf-connecting-ip": "192.0.2.44" },
        ),
        "/api/v1/meter/pass",
        store,
      );
      const res = await handleInternalMeterInvoices(
        new Request("https://agent-control.net/api/v1/internal/meter/invoices?status=pending", {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
        store,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        invoices: Array<{
          invoice_id: string;
          status: string;
          created_at: string;
          expires_at: string;
          source: string;
          user_agent: string;
          cf_connecting_ip_hash: string;
          partner: string;
          amount_usd: number;
        }>;
      };
      assert.equal(body.invoices.length, 1);
      const row = body.invoices[0];
      assert.ok(row);
      assert.equal(row.source, "http_pass");
      assert.equal(row.user_agent, "list-agent");
      assert.equal(row.partner, "x402");
      assert.equal(row.amount_usd, 0.25);
      assert.equal(row.status, "pending");
      assert.ok(row.invoice_id);
      assert.ok(row.created_at);
      assert.ok(row.expires_at);
      assert.equal(row.cf_connecting_ip_hash, hashMeterClientIp("192.0.2.44", SECRET));
      const text = JSON.stringify(body);
      assert.doesNotMatch(text, /192\.0\.2\.44/);
      assert.doesNotMatch(text, /"ip"/);
    });
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
