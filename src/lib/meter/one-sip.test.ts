import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMeterRequest } from "./http.ts";

const ORIGIN = "https://agent-control.net";
const FROM = "0x1111111111111111111111111111111111111111";

function post(path: string, body: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function payment(invoice: { invoice_id: string; reference: string; amount_base_units: string }) {
  return {
    x402Version: 2,
    payload: {
      authorization: {
        from: FROM,
        to: "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98",
        value: invoice.amount_base_units,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 600),
        nonce: `0x${"11".repeat(32)}`,
      },
      signature: `0x${"22".repeat(65)}`,
    },
    accepted: {
      network: "base",
      extra: { invoice_id: invoice.invoice_id, reference: invoice.reference },
    },
  };
}

describe("one sip", () => {
  it("scan + payment in one request returns the look", async () => {
    process.env.NODE_ENV = "test";
    const { createMeterStore } = await import("./store.ts");
    const store = createMeterStore();
    const quote = await handleMeterRequest(post("/api/v1/meter/pass", { sku: "look" }), "/api/v1/meter/pass", store);
    const invoice = (await quote.json()) as {
      invoice_id: string;
      reference: string;
      amount_base_units: string;
    };
    const scanned = await handleMeterRequest(
      post("/api/v1/meter/scan", {
        chain: "solana",
        address: "11111111111111111111111111111111",
        invoice_id: invoice.invoice_id,
        payment: payment(invoice),
      }),
      "/api/v1/meter/scan",
      store,
      {
        settleExactEvm: async () => ({ ok: true, transaction: "0xonesip", payer: FROM }),
      },
    );
    assert.equal(scanned.status, 200);
    const body = (await scanned.json()) as { question: string; token?: string; risk?: string };
    assert.equal(body.question, "Can I pay this address?");
    assert.ok(body.risk);
  });
});
