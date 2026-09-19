import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EXACT_TTL_SEC,
  DEFAULT_METER_ORIGIN,
  DEFAULT_PASS_BASE_UNITS,
  LOCKED_BASE_PAY_TO,
  METER_BASE_NETWORK,
  METER_BASE_USDC,
  assertPayerIsNotBaseReceiveWallet,
  buildMeterExactAuthorization,
  buildMeterExactPayment,
  buyMeterPassBase,
  lockedMeterBasePayTo,
  meterExactTypedData,
  payMeterPassBase,
  type MeterFetchLike,
  type MeterPassInvoice,
} from "./meter-pay-base.ts";

const FROM = "0x1111111111111111111111111111111111111111";
const HOSTILE_TO = "0x000000000000000000000000000000000000dEaD";
const SIG = `0x${"ab".repeat(65)}`;

function invoice(over: Partial<MeterPassInvoice> = {}): MeterPassInvoice {
  return {
    invoice_id: "inv_base_202f5a77",
    pay_to: "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
    base_pay_to: LOCKED_BASE_PAY_TO,
    reference: "ref_base",
    amount_usd: 0.2,
    amount_base_units: "200000",
    sku: "looks_20",
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Agent Meter Base buyer adapter", () => {
  it("locks Base payout and USDC; invoice cannot retarget funds", () => {
    assert.equal(LOCKED_BASE_PAY_TO, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.equal(METER_BASE_USDC, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    assert.equal(DEFAULT_PASS_BASE_UNITS, "200000");
    assert.equal(DEFAULT_EXACT_TTL_SEC, 300);
    assert.equal(lockedMeterBasePayTo(HOSTILE_TO), LOCKED_BASE_PAY_TO);
    const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    assert.match(index, /buyMeterPassBase/);
    assert.match(index, /payMeterPassBase/);
    assert.match(index, /meterExactTypedData/);
    assert.match(index, /meter-pay-base\.ts/);
  });

  it("builds EIP-3009 exact to the locked base_pay_to", () => {
    const auth = buildMeterExactAuthorization({
      from: FROM,
      amountBaseUnits: "200000",
      nowSec: 1_700_000_000,
      nonce: `0x${"11".repeat(32)}`,
    });
    assert.equal(auth.from, FROM);
    assert.equal(auth.to, LOCKED_BASE_PAY_TO);
    assert.equal(auth.value, "200000");
    assert.equal(auth.validAfter, "0");
    assert.equal(auth.validBefore, String(1_700_000_000 + 300));
    const payment = buildMeterExactPayment({
      invoice: invoice(),
      authorization: auth,
      signature: SIG,
    });
    const payload = payment.payload as { authorization: { to: string; value: string } };
    const accepted = payment.accepted as { network: string; extra: { invoice_id: string } };
    assert.equal(payload.authorization.to, LOCKED_BASE_PAY_TO);
    assert.equal(payload.authorization.value, "200000");
    assert.equal(accepted.network, METER_BASE_NETWORK);
    assert.equal(accepted.extra.invoice_id, "inv_base_202f5a77");
    const typed = meterExactTypedData(auth);
    assert.equal(typed.primaryType, "TransferWithAuthorization");
    assert.equal(typed.domain.chainId, 8453);
    assert.equal(typed.domain.verifyingContract, METER_BASE_USDC);
    assert.equal(typed.message.to, LOCKED_BASE_PAY_TO);
    assert.equal(typed.message.value, "200000");
  });

  it("refuses paying from the locked receive wallet or a retargeted to", async () => {
    assert.throws(() => assertPayerIsNotBaseReceiveWallet(LOCKED_BASE_PAY_TO), /receive wallet/i);
    assert.throws(
      () =>
        buildMeterExactPayment({
          invoice: invoice(),
          authorization: {
            from: FROM,
            to: HOSTILE_TO,
            value: "200000",
            validAfter: "0",
            validBefore: "999",
            nonce: `0x${"11".repeat(32)}`,
          },
          signature: SIG,
        }),
      /payTo is locked/,
    );
    let signed = 0;
    await assert.rejects(
      () =>
        payMeterPassBase({
          invoice: invoice(),
          from: FROM,
          signExact: async (authorization) => {
            signed += 1;
            return { authorization: { ...authorization, to: HOSTILE_TO }, signature: SIG };
          },
        }),
      /payTo is locked/,
    );
    assert.equal(signed, 1);
  });

  it("buyMeterPassBase does pass → signExact → watch with payment and returns the token", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchFn: MeterFetchLike = async (url, init) => {
      calls.push({ url, body: init?.body ?? "" });
      if (url.endsWith("/api/v1/meter/pass")) {
        assert.equal(init?.method, "POST");
        assert.equal(init?.body, "{}");
        return jsonResponse(invoice(), 402);
      }
      if (url.endsWith("/api/v1/meter/watch")) {
        const body = JSON.parse(init?.body ?? "{}") as {
          invoice_id: string;
          payment: { payload: { authorization: { to: string } } };
        };
        assert.equal(body.invoice_id, "inv_base_202f5a77");
        assert.equal(body.payment.payload.authorization.to, LOCKED_BASE_PAY_TO);
        return jsonResponse({
          token: "acp_base_pass",
          invoice_id: "inv_base_202f5a77",
          signature: SIG,
          pass_id: "pass_base",
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const bought = await buyMeterPassBase({
      from: FROM,
      fetch: fetchFn,
      signExact: async (authorization) => ({ authorization, signature: SIG }),
      watchAttempts: 2,
      sleep: async () => {},
    });

    assert.equal(bought.token, "acp_base_pass");
    assert.equal(bought.invoice_id, "inv_base_202f5a77");
    assert.equal(bought.pass_id, "pass_base");
    assert.equal(calls[0]?.url, `${DEFAULT_METER_ORIGIN}/api/v1/meter/pass`);
    assert.equal(calls[1]?.url, `${DEFAULT_METER_ORIGIN}/api/v1/meter/watch`);
  });

  it("omits sku for looks_20 and refuses the receive wallet before fetch", async () => {
    let passBody = "";
    const bought = await buyMeterPassBase({
      from: FROM,
      sku: "looks_20",
      fetch: async (_url, init) => {
        if (!passBody) {
          passBody = init?.body ?? "";
          return jsonResponse(invoice({ sku: "looks_20" }), 402);
        }
        return jsonResponse({ token: "acp_20", invoice_id: "inv_base_202f5a77" });
      },
      signExact: async (authorization) => ({ authorization, signature: SIG }),
      sleep: async () => {},
    });
    assert.deepEqual(JSON.parse(passBody), { sku: "looks_20" });
    assert.equal(bought.token, "acp_20");

    await assert.rejects(
      () =>
        buyMeterPassBase({
          from: LOCKED_BASE_PAY_TO,
          fetch: async () => jsonResponse(invoice(), 402),
          signExact: async (authorization) => ({ authorization, signature: SIG }),
        }),
      /receive wallet/i,
    );
  });
});
