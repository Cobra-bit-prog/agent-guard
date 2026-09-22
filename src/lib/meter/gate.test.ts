import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAMP_ID_HEADER as ADAPTER_STAMP_HEADER,
  STAMP_TX_PRICE_USD,
  merchantStampRequiredBody,
  requireMerchantStamp,
  stampViewAllows,
  verifyMerchantStamp,
  type StampFetch,
} from "../../adapters/stamp-gate.ts";
import { STAMP_ID_HEADER } from "../meter-recipe.ts";
import { METER_STAMP_TX } from "./pricing.ts";
import { handleMeterRequest } from "./http.ts";
import { handleStampGate } from "./gate.ts";
import { createMeterStore, type MeterStore } from "./store.ts";

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
});
