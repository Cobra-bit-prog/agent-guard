import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAY_EXPIRY_MS, SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import { evaluateTransfer } from "../policy.ts";
import { SCAN_SINK_FIXTURE } from "./denylist.ts";
import { handleInternalMeterInvoices, handleMeterRequest } from "./http.ts";
import {
  extractMeterInvoiceOrigin,
  hashMeterClientIp,
  isSmokeUserAgent,
  meterInvoiceSourceForMcpTool,
  METER_USER_AGENT_MAX,
} from "./origin.ts";
import { evaluatePreflightSelf, missingPreflightFields, PREFLIGHT_REQUIRED } from "./preflight.ts";
import { evaluateScan } from "./scan.ts";
import { createMeterStore, meterIdentityKey } from "./store.ts";
import { METER_ANON_IDENTITY, meter402Body, meter402PaymentRequiredPayload } from "./pricing.ts";

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

function assertMeter402IndexHeaders(res: Response, reference?: string) {
  const paymentRequired = res.headers.get("PAYMENT-REQUIRED") ?? res.headers.get("payment-required") ?? "";
  const www = res.headers.get("WWW-Authenticate") ?? res.headers.get("www-authenticate") ?? "";
  const expose = res.headers.get("Access-Control-Expose-Headers") ?? "";
  assert.ok(paymentRequired, "PAYMENT-REQUIRED header");
  assert.match(www, /Payment realm="Agent Meter"/);
  assert.match(www, /chain="solana"/);
  assert.match(www, /token="USDC"/);
  assert.match(www, new RegExp(`address="${SOLANA_PAYOUT_ADDRESS}"`));
  assert.match(expose, /PAYMENT-REQUIRED/);
  assert.match(expose, /WWW-Authenticate/);
  const decoded = JSON.parse(Buffer.from(paymentRequired, "base64").toString("utf8")) as {
    x402Version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      maxAmountRequired: string;
      payTo: string;
      asset: string;
      extra: { reference: string };
    }>;
  };
  assert.equal(decoded.x402Version, 2);
  assert.equal(decoded.accepts[0]?.scheme, "exact");
  assert.equal(decoded.accepts[0]?.network, "solana");
  assert.equal(decoded.accepts[0]?.payTo, SOLANA_PAYOUT_ADDRESS);
  assert.equal(decoded.accepts[0]?.asset, USDC_MINT);
  if (reference) assert.equal(decoded.accepts[0]?.extra.reference, reference);
  assert.match(www, new RegExp(`reference="${decoded.accepts[0]?.extra.reference}"`));
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

  it("lists required fields when the body is wrong or missing", () => {
    assert.deepEqual(PREFLIGHT_REQUIRED, ["chain", "wallet", "to", "value_usd", "cap_usd"]);
    assert.deepEqual(missingPreflightFields({}), ["chain", "wallet", "to", "value_usd", "cap_usd"]);
    assert.deepEqual(missingPreflightFields({ chain: "solana", wallet: "W", to: "T" }), [
      "value_usd",
      "cap_usd",
    ]);
    assert.deepEqual(
      missingPreflightFields({
        chain: "solana",
        wallet: "W",
        to: "T",
        value_usd: 10,
        cap_usd: 100,
      }),
      [],
    );
  });
});

describe("meter identity", () => {
  it("hashes X-Agent-Pass; empty pass is anon", () => {
    assert.equal(meterIdentityKey(""), METER_ANON_IDENTITY);
    assert.equal(meterIdentityKey("   "), METER_ANON_IDENTITY);
    const pass = "agent-abc";
    assert.equal(meterIdentityKey(pass), createHash("sha256").update(`meter-id:${pass}`).digest("hex"));
    assert.notEqual(meterIdentityKey(pass), pass);
    assert.notEqual(meterIdentityKey(pass), METER_ANON_IDENTITY);
  });
});

describe("meter http", () => {
  it("preflight missing body is 400 listing wallet, to, value_usd, cap_usd", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/preflight", { chain: "solana" }),
      "/api/v1/meter/preflight",
      store,
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; required: string[]; missing: string[] };
    assert.match(body.error, /wallet/);
    assert.match(body.error, /to/);
    assert.match(body.error, /value_usd/);
    assert.match(body.error, /cap_usd/);
    assert.deepEqual(body.required, ["chain", "wallet", "to", "value_usd", "cap_usd"]);
    assert.deepEqual(body.missing, ["wallet", "to", "value_usd", "cap_usd"]);
  });

  it("402 next tells the agent to pay 0.02, watch, then retry with the same X-Agent-Pass", () => {
    const body = meter402Body({
      invoice_id: "inv_test",
      pay_to: "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
      reference: "ref_test",
      amount_usd: 0.02,
      amount_base_units: "20000",
      chain: "solana",
      asset: "usdc",
      sku: "look",
    });
    assert.match(body.next, /0\.02 USDC/);
    assert.match(body.next, /watch/);
    assert.match(body.next, /same X-Agent-Pass/);
  });

  it("402index PAYMENT-REQUIRED payTo stays on the locked wallet", () => {
    const payload = meter402PaymentRequiredPayload({
      invoice_id: "inv_hostile",
      pay_to: "HostileWalletDoNotPay11111111111111111111",
      reference: "ref_lock",
      amount_usd: 0.02,
      amount_base_units: "20000",
      chain: "solana",
      asset: "usdc",
      sku: "look",
    });
    assert.equal(payload.accepts[0]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(payload.accepts[0]?.payTo, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.notEqual(payload.accepts[0]?.payTo, "HostileWalletDoNotPay11111111111111111111");
    assert.equal(payload.accepts[0]?.asset, USDC_MINT);
  });

  it("scans a sink after a looks_20 pack", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
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
    const body = (await res.json()) as { risk: string; pass_remaining_calls: number; question: string };
    assert.equal(body.risk, "sink");
    assert.equal(body.question, "Can I pay this address?");
    assert.equal(body.pass_remaining_calls, 19);
    process.env.NODE_ENV = prev;
  });

  it("scans unknown as new", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
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
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
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
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
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
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
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
    const body = (await res.json()) as { product: string; pass: { price_usd: number }; default_sku: string };
    assert.equal(body.product, "Agent Meter");
    assert.equal(body.pass.price_usd, 0.02);
    assert.equal(body.default_sku, "look");
  });

  it("GET invoice returns pay_url to the locked payout wallet", async () => {
    const store = createMeterStore();
    const invoice = await store.createInvoice({ sku: "look" });
    const res = await handleMeterRequest(
      get(`/api/v1/meter/invoice/${invoice.invoice_id}`),
      `/api/v1/meter/invoice/${invoice.invoice_id}`,
      store,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      invoice_id: string;
      amount_usd: number;
      pay_to: string;
      reference: string;
      pay_url: string;
    };
    assert.equal(body.invoice_id, invoice.invoice_id);
    assert.equal(body.amount_usd, 0.02);
    assert.equal(body.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.match(body.pay_url, /^solana:49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR\?/);
    assert.match(body.pay_url, new RegExp(`reference=${invoice.reference}`));
  });
});

describe("extra meter skus", () => {
  it("pricing.skus lists catalog ids and keeps look as default", async () => {
    const res = await handleMeterRequest(get("/api/v1/meter/pricing"), "/api/v1/meter/pricing", createMeterStore());
    const body = (await res.json()) as {
      default_sku: string;
      pass: { id: string; price_usd: number };
      skus: { id: string; price_usd: number }[];
      funds: { pay_to: string };
      free_looks: number;
    };
    assert.equal(body.default_sku, "look");
    assert.equal(body.pass.id, "look");
    assert.equal(body.pass.price_usd, 0.02);
    assert.equal(body.free_looks, 5);
    assert.deepEqual(
      body.skus.map((row) => row.id),
      ["look", "looks_20", "addresses_100", "stamp_tx", "pass_1h"],
    );
    assert.equal(body.skus.find((row) => row.id === "looks_20")?.price_usd, 0.2);
    assert.equal(body.skus.find((row) => row.id === "addresses_100")?.price_usd, 0.15);
    assert.equal(body.skus.find((row) => row.id === "stamp_tx")?.price_usd, 0.05);
    assert.equal(body.funds.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
  });

  it("POST pass {} invoices look $0.02", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(post("/api/v1/meter/pass", {}), "/api/v1/meter/pass", store);
    assert.equal(res.status, 402);
    const body = (await res.json()) as { sku: string; amount_usd: number; pay_to: string; reference: string };
    assert.equal(body.sku, "look");
    assert.equal(body.amount_usd, 0.02);
    assert.equal(body.pay_to, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assertMeter402IndexHeaders(res, body.reference);
  });

  it("POST pass sku=looks_20 invoices $0.20", async () => {
    const store = createMeterStore();
    const res = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "looks_20" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(res.status, 402);
    const body = (await res.json()) as { sku: string; amount_usd: number; price_usd: number };
    assert.equal(body.sku, "looks_20");
    assert.equal(body.amount_usd, 0.2);
    assert.equal(body.price_usd, 0.2);
  });

  it("fulfillInvoice mints the invoice sku, not always look", async () => {
    const store = createMeterStore();
    const invoice = await store.createInvoice({ sku: "looks_20" });
    assert.equal(invoice.amount_usd, 0.2);
    const paid = await store.fulfillInvoice(invoice.invoice_id, { signature: "sig20", amountUsdc: 0.2 });
    assert.equal(paid.pass.sku, "looks_20");
    assert.equal(paid.pass.included_calls, 20);
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
      post("/api/v1/meter/pass", { sku: "pass_1h", proof: { type: "dev" } }),
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
            "user-agent": "MeterClient/1.0",
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
      assert.equal(invoice.user_agent, "MeterClient/1.0");
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
      for (let i = 0; i < 5; i += 1) {
        const free = await handleMeterRequest(
          post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }),
          "/api/v1/meter/scan",
          store,
        );
        assert.equal(free.status, 200);
      }
      const scan = await handleMeterRequest(
        post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }),
        "/api/v1/meter/scan",
        store,
      );
      const scanBody = (await scan.json()) as { invoice_id: string };
      assert.equal(scan.status, 402);
      assert.equal((await store.getInvoice(scanBody.invoice_id))?.source, "http_scan");

      const pre = await handleMeterRequest(
        post("/api/v1/meter/preflight", {
          chain: "solana",
          wallet: "W",
          to: "T",
          value_usd: 10,
          cap_usd: 100,
        }),
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
    assert.equal(report.usdc_pending_fresh, 0.02);
    assert.equal(report.usdc_pending_stale, 0.02);
    assert.equal(report.invoices_pending_smoke, 0);
    assert.equal(report.usdc_pending_smoke, 0);
  });

  it("accepts explicit smoke source on POST /pass", async () => {
    const store = createMeterStore();
    const bodyFlag = await handleMeterRequest(
      post("/api/v1/meter/pass", { source: "smoke" }, { "user-agent": "Mozilla/5.0 Phantom/24.0" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(bodyFlag.status, 402);
    const bodyInvoice = await store.getInvoice(((await bodyFlag.json()) as { invoice_id: string }).invoice_id);
    assert.equal(bodyInvoice?.source, "smoke");

    const headerFlag = await handleMeterRequest(
      post("/api/v1/meter/pass", {}, { "user-agent": "MeterClient/1.0", "x-meter-smoke": "1" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(headerFlag.status, 402);
    const headerInvoice = await store.getInvoice(
      ((await headerFlag.json()) as { invoice_id: string }).invoice_id,
    );
    assert.equal(headerInvoice?.source, "smoke");
  });

  it("auto-tags curl, python-requests, and httpx UAs as smoke", async () => {
    assert.equal(isSmokeUserAgent("curl/8.0"), true);
    assert.equal(isSmokeUserAgent("python-requests/2.31.0"), true);
    assert.equal(isSmokeUserAgent("httpx/0.27.0"), true);
    assert.equal(isSmokeUserAgent("python-httpx/0.27.2"), true);
    assert.equal(isSmokeUserAgent("CoS/1.0"), true);
    assert.equal(isSmokeUserAgent("meter-health/1"), true);
    assert.equal(isSmokeUserAgent("Mozilla/5.0 Phantom/24.0"), false);
    assert.equal(isSmokeUserAgent("mcp-inspector/1"), false);
    assert.equal(isSmokeUserAgent("MeterClient/1.0"), false);
    assert.equal(isSmokeUserAgent(""), false);

    const store = createMeterStore();
    for (const ua of ["curl/8.0", "python-requests/2.31.0", "httpx/0.27.0"]) {
      const res = await handleMeterRequest(
        post("/api/v1/meter/pass", {}, { "user-agent": ua }),
        "/api/v1/meter/pass",
        store,
      );
      assert.equal(res.status, 402);
      const invoice = await store.getInvoice(((await res.json()) as { invoice_id: string }).invoice_id);
      assert.equal(invoice?.source, "smoke", ua);
      assert.equal(invoice?.user_agent, ua);
    }
  });

  it("never auto-tags Phantom, browser, or MCP agent clients as smoke", async () => {
    const store = createMeterStore();
    const phantom = await handleMeterRequest(
      post(
        "/api/v1/meter/pass",
        {},
        {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Phantom/24.0",
        },
      ),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(
      (await store.getInvoice(((await phantom.json()) as { invoice_id: string }).invoice_id))?.source,
      "http_pass",
    );

    const mcp = await handleMeterRequest(
      post("/api/v1/meter/pass", {}, { "user-agent": "mcp-inspector/1" }),
      "/api/v1/meter/pass",
      store,
      { source: "mcp_buy_pass" },
    );
    assert.equal(
      (await store.getInvoice(((await mcp.json()) as { invoice_id: string }).invoice_id))?.source,
      "mcp_buy_pass",
    );
  });

  it("excludes smoke from pending_stale and still counts http_pass and mcp_buy_pass", async () => {
    const store = createMeterStore();
    const staleMs = Date.now() - PAY_EXPIRY_MS - 5_000;
    store.createInvoice({ nowMs: staleMs, origin: { source: "http_pass" } });
    store.createInvoice({ origin: { source: "http_pass" } });
    store.createInvoice({ origin: { source: "mcp_buy_pass" } });
    store.createInvoice({ nowMs: staleMs, origin: { source: "smoke" } });
    store.createInvoice({ origin: { source: "smoke" } });
    const report = await store.report();
    assert.equal(report.invoices_created, 5);
    assert.equal(report.invoices_pending, 2);
    assert.equal(report.invoices_pending_fresh, 2);
    assert.equal(report.invoices_pending_stale, 1);
    assert.equal(report.invoices_pending_smoke, 2);
    assert.equal(report.usdc_pending, 0.04);
    assert.equal(report.usdc_pending_fresh, 0.04);
    assert.equal(report.usdc_pending_stale, 0.02);
    assert.equal(report.usdc_pending_smoke, 0.04);
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
      assert.equal(row.amount_usd, 0.02);
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

  it("internal invoice list can filter source=smoke or exclude_smoke", async () => {
    await withStatsSecret(async () => {
      const store = createMeterStore();
      await handleMeterRequest(
        post("/api/v1/meter/pass", {}, { "user-agent": "MeterClient/1.0" }),
        "/api/v1/meter/pass",
        store,
      );
      await handleMeterRequest(
        post("/api/v1/meter/pass", {}, { "user-agent": "curl/8.5.0" }),
        "/api/v1/meter/pass",
        store,
      );
      const smokeOnly = await handleInternalMeterInvoices(
        new Request("https://agent-control.net/api/v1/internal/meter/invoices?source=smoke", {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
        store,
      );
      const smokeBody = (await smokeOnly.json()) as { invoices: Array<{ source: string }> };
      assert.equal(smokeBody.invoices.length, 1);
      assert.equal(smokeBody.invoices[0]?.source, "smoke");

      const realOnly = await handleInternalMeterInvoices(
        new Request("https://agent-control.net/api/v1/internal/meter/invoices?exclude_smoke=1", {
          headers: { authorization: `Bearer ${SECRET}` },
        }),
        store,
      );
      const realBody = (await realOnly.json()) as { invoices: Array<{ source: string }> };
      assert.equal(realBody.invoices.length, 1);
      assert.equal(realBody.invoices[0]?.source, "http_pass");
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

describe("paying agents A–H", () => {
  const PAY_TO = "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR";

  async function scanOnce(store: ReturnType<typeof createMeterStore>, headers: Record<string, string> = {}) {
    return handleMeterRequest(
      post("/api/v1/meter/scan", { chain: "solana", address: SCAN_SINK_FIXTURE }, headers),
      "/api/v1/meter/scan",
      store,
    );
  }

  it("A free5: first 5 looks succeed without a pack", async () => {
    const store = createMeterStore();
    for (let i = 1; i <= 5; i += 1) {
      const res = await scanOnce(store);
      assert.equal(res.status, 200, `look ${i}`);
      const body = (await res.json()) as { risk: string; free_looks_remaining: number; question: string };
      assert.equal(body.risk, "sink");
      assert.equal(body.question, "Can I pay this address?");
      assert.equal(body.free_looks_remaining, 5 - i);
    }
  });

  it("B 402 $0.02 pay_to locked wallet after free5", async () => {
    const store = createMeterStore();
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await scanOnce(store)).status, 200);
    }
    const res = await scanOnce(store);
    assert.equal(res.status, 402);
    const body = (await res.json()) as {
      sku: string;
      amount_usd: number;
      pay_to: string;
      error: string;
      next: string;
      reference: string;
    };
    assert.equal(body.error, "payment_required");
    assert.equal(body.sku, "look");
    assert.equal(body.amount_usd, 0.02);
    assert.equal(body.pay_to, PAY_TO);
    assert.match(body.next, /0\.02 USDC/);
    assert.match(body.next, /watch/);
    assert.match(body.next, /same X-Agent-Pass/);
    assertMeter402IndexHeaders(res, body.reference);
  });

  it("C pack20: looks_20 covers 20 looks", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "looks_20", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string; sku: string; included_calls: number };
    assert.equal(pass.sku, "looks_20");
    assert.equal(pass.included_calls, 20);
    const first = await scanOnce(store, { "X-Agent-Pass": pass.token });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { pass_remaining_calls: number };
    assert.equal(firstBody.pass_remaining_calls, 19);
    for (let i = 0; i < 19; i += 1) {
      assert.equal((await scanOnce(store, { "X-Agent-Pass": pass.token })).status, 200);
    }
    const done = await scanOnce(store, { "X-Agent-Pass": pass.token });
    assert.equal(done.status, 402);
    const doneBody = (await done.json()) as { sku: string; amount_usd: number; reference: string };
    assert.equal(doneBody.sku, "look");
    assert.equal(doneBody.amount_usd, 0.02);
    assertMeter402IndexHeaders(done, doneBody.reference);
  });

  it("D batch100: addresses_100 covers one batch of up to 100", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "addresses_100", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string; sku: string; included_calls: number };
    assert.equal(pass.sku, "addresses_100");
    assert.equal(pass.included_calls, 1);
    const addresses = Array.from({ length: 100 }, (_, i) => `BatchWallet${String(i).padStart(3, "0")}`);
    const batch = await handleMeterRequest(
      post("/api/v1/meter/scan-batch", { chain: "solana", addresses }, { "X-Agent-Pass": pass.token }),
      "/api/v1/meter/scan-batch",
      store,
    );
    assert.equal(batch.status, 200);
    const body = (await batch.json()) as { count: number; risk: string };
    assert.equal(body.count, 100);
    assert.equal(body.risk, "new");
  });

  it("E stamp $0.05 ticket copy", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const quote = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "stamp_tx" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(quote.status, 402);
    const quoteBody = (await quote.json()) as { sku: string; amount_usd: number; reference: string };
    assert.equal(quoteBody.sku, "stamp_tx");
    assert.equal(quoteBody.amount_usd, 0.05);
    assertMeter402IndexHeaders(quote, quoteBody.reference);

    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "stamp_tx", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const stamp = await handleMeterRequest(
      post("/api/v1/meter/stamp", { decision: "allow", chain: "solana", to: "Shop" }, { "X-Agent-Pass": pass.token }),
      "/api/v1/meter/stamp",
      store,
    );
    assert.equal(stamp.status, 200);
    const body = (await stamp.json()) as { ticket: string; price_usd: number; verified: boolean };
    assert.equal(body.ticket, "Take this ticket or we do not take your USDC.");
    assert.equal(body.price_usd, 0.05);
    assert.equal(body.verified, true);
  });

  it("F payout lock stays on the receive wallet", async () => {
    const store = createMeterStore();
    const invoice = await store.createInvoice({ sku: "look" });
    assert.equal(invoice.pay_to, PAY_TO);
    const pricing = await handleMeterRequest(get("/api/v1/meter/pricing"), "/api/v1/meter/pricing", store);
    const body = (await pricing.json()) as { funds: { pay_to: string } };
    assert.equal(body.funds.pay_to, PAY_TO);
  });

  it("G scan and preflight never hold", async () => {
    const store = createMeterStore();
    const scan = await scanOnce(store);
    const scanBody = (await scan.json()) as { risk: string };
    assert.ok(["ok", "new", "warn", "sink"].includes(scanBody.risk));
    assert.notEqual(scanBody.risk, "hold");
    const pre = await handleMeterRequest(
      post("/api/v1/meter/preflight", {
        chain: "solana",
        wallet: "AgentG",
        to: "ShopG",
        value_usd: 5,
        cap_usd: 20,
      }),
      "/api/v1/meter/preflight",
      store,
    );
    const preBody = (await pre.json()) as { decision: string };
    assert.ok(preBody.decision === "allow" || preBody.decision === "stop");
    assert.notEqual(preBody.decision, "hold");
    assert.equal(store.pendingApprovalsCreated, 0);
  });

  it("H smoke header tags POST /pass health checks", async () => {
    const store = createMeterStore();
    const headerFlag = await handleMeterRequest(
      post("/api/v1/meter/pass", {}, { "user-agent": "MeterClient/1.0", "x-meter-smoke": "1" }),
      "/api/v1/meter/pass",
      store,
    );
    assert.equal(headerFlag.status, 402);
    const invoice = await store.getInvoice(((await headerFlag.json()) as { invoice_id: string }).invoice_id);
    assert.equal(invoice?.source, "smoke");
    assert.equal(invoice?.sku, "look");
    assert.equal(invoice?.amount_usd, 0.02);
  });
});
