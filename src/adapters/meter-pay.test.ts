import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  DEFAULT_METER_ORIGIN,
  DEFAULT_METER_SKU,
  DEFAULT_PASS_BASE_UNITS,
  DEFAULT_PASS_USD,
  LOCKED_SOLANA_PAY_TO,
  METER_USDC_MINT,
  assertPayerIsNotReceiveWallet,
  buildMeterUsdcTransfer,
  buyMeterPass,
  lockedMeterPayTo,
  payMeterPass,
  resolveMeterPassInvoice,
  type MeterFetchLike,
  type MeterPassInvoice,
} from "./meter-pay.ts";
import { buyMeterPass as buyFromIndex, payMeterPass as payFromIndex } from "./index.ts";

const REF = "HF57Ln9oqXT22zgj2b4fBsbVoMtPndE6rYmAMVhs78Yj";
const HOSTILE_PAY_TO = "WrongWalletDoNotUse111111111111111111111";

function invoice(over: Partial<MeterPassInvoice> = {}): MeterPassInvoice {
  return {
    invoice_id: "inv_202f5a771d4c6f77",
    pay_to: LOCKED_SOLANA_PAY_TO,
    reference: REF,
    amount_usd: 0.25,
    amount_base_units: "250000",
    pay_url: `solana:${LOCKED_SOLANA_PAY_TO}?amount=0.25&spl-token=${METER_USDC_MINT}&reference=${REF}`,
    sku: "pass_1h",
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Agent Meter auto-pay adapter", () => {
  it("locks payout, mint, and the $0.25 default pass", () => {
    assert.equal(LOCKED_SOLANA_PAY_TO, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(METER_USDC_MINT, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    assert.equal(DEFAULT_METER_SKU, "pass_1h");
    assert.equal(DEFAULT_PASS_USD, 0.25);
    assert.equal(DEFAULT_PASS_BASE_UNITS, "250000");
    assert.equal(lockedMeterPayTo(HOSTILE_PAY_TO), LOCKED_SOLANA_PAY_TO);
    assert.equal(buyFromIndex, buyMeterPass);
    assert.equal(payFromIndex, payMeterPass);
  });

  it("ignores a hostile pay_to and keeps the 402 reference", () => {
    const paid = resolveMeterPassInvoice(
      invoice({ pay_to: HOSTILE_PAY_TO, amount_usd: 99, amount_base_units: "250000" }),
    );
    assert.equal(paid.payTo, LOCKED_SOLANA_PAY_TO);
    assert.equal(paid.reference, REF);
    assert.equal(paid.amountBaseUnits, "250000");
    assert.equal(paid.invoiceId, "inv_202f5a771d4c6f77");
  });

  it("puts the Solana Pay reference on the transfer as a non-signer extra account", () => {
    const payer = Keypair.generate();
    const built = buildMeterUsdcTransfer({
      payer: payer.publicKey,
      reference: REF,
      amountBaseUnits: "250000",
      payTo: HOSTILE_PAY_TO,
    });
    assert.equal(built.destOwner.toBase58(), LOCKED_SOLANA_PAY_TO);
    assert.equal(built.amount, 250000n);
    assert.equal(built.reference.toBase58(), REF);
    assert.equal(built.instructions.length, 2);
    const transfer = built.instructions[1];
    assert.ok(transfer);
    assert.equal(transfer.programId.equals(TOKEN_PROGRAM_ID), true);
    const refKey = transfer.keys.find((k) => k.pubkey.equals(built.reference));
    assert.ok(refKey);
    assert.equal(refKey.isSigner, false);
    assert.equal(refKey.isWritable, false);
    assert.equal(
      transfer.keys.some((k) => k.pubkey.equals(payer.publicKey) && k.isSigner),
      true,
    );
  });

  it("refuses paying from the locked receive wallet", () => {
    assert.throws(() => assertPayerIsNotReceiveWallet(LOCKED_SOLANA_PAY_TO), /receive wallet/i);
    assert.throws(
      () =>
        buildMeterUsdcTransfer({
          payer: LOCKED_SOLANA_PAY_TO,
          reference: REF,
          amountBaseUnits: "250000",
        }),
      /receive wallet/i,
    );
  });

  it("payMeterPass builds the referenced transfer and does not use the receive wallet", async () => {
    const payer = Keypair.generate();
    let sawRef = false;
    const result = await payMeterPass({
      invoice: invoice({ pay_to: HOSTILE_PAY_TO }),
      keypairOrSigner: payer,
      sendTransaction: async (tx, signer) => {
        assert.equal(signer.publicKey.toBase58(), payer.publicKey.toBase58());
        assert.notEqual(signer.publicKey.toBase58(), LOCKED_SOLANA_PAY_TO);
        const transfer = tx.instructions[1];
        assert.ok(transfer);
        const refKey = transfer.keys.find((k) => k.pubkey.equals(new PublicKey(REF)));
        assert.ok(refKey);
        assert.equal(refKey.isSigner, false);
        sawRef = true;
        return "sig_meter_pay";
      },
    });
    assert.equal(result.signature, "sig_meter_pay");
    assert.equal(result.invoice_id, "inv_202f5a771d4c6f77");
    assert.equal(sawRef, true);
  });

  it("payMeterPass refuses a receive-wallet signer before send", async () => {
    const receiveSigner = {
      publicKey: new PublicKey(LOCKED_SOLANA_PAY_TO),
      secretKey: new Uint8Array(64),
    };
    let sent = 0;
    await assert.rejects(
      () =>
        payMeterPass({
          invoice: invoice(),
          keypairOrSigner: receiveSigner,
          sendTransaction: async () => {
            sent += 1;
            return "should_not_send";
          },
        }),
      /receive wallet/i,
    );
    assert.equal(sent, 0);
  });

  it("buyMeterPass does pass → pay → watch and returns the token", async () => {
    const payer = Keypair.generate();
    const calls: { url: string; body: string }[] = [];
    const fetchFn: MeterFetchLike = async (url, init) => {
      calls.push({ url, body: init?.body ?? "" });
      if (url.endsWith("/api/v1/meter/pass")) {
        assert.equal(init?.method, "POST");
        assert.equal(init?.body, "{}");
        return jsonResponse(invoice(), 402);
      }
      if (url.endsWith("/api/v1/meter/watch")) {
        assert.deepEqual(JSON.parse(init?.body ?? "{}"), { invoice_id: "inv_202f5a771d4c6f77" });
        return jsonResponse({
          token: "acp_test_pass",
          invoice_id: "inv_202f5a771d4c6f77",
          signature: "sig_chain",
          pass_id: "pass_1",
        });
      }
      throw new Error(`unexpected ${url}`);
    };

    const bought = await buyMeterPass({
      keypair: payer,
      fetch: fetchFn,
      pay: async ({ invoice: inv, keypairOrSigner }) => {
        assert.equal(inv.invoice_id, "inv_202f5a771d4c6f77");
        assert.equal(inv.reference, REF);
        assert.equal(keypairOrSigner.publicKey.toBase58(), payer.publicKey.toBase58());
        return { signature: "sig_local", invoice_id: "inv_202f5a771d4c6f77" };
      },
      watchAttempts: 2,
      sleep: async () => {},
    });

    assert.equal(bought.token, "acp_test_pass");
    assert.equal(bought.invoice_id, "inv_202f5a771d4c6f77");
    assert.equal(bought.signature, "sig_chain");
    assert.equal(bought.pass_id, "pass_1");
    assert.equal(calls[0]?.url, `${DEFAULT_METER_ORIGIN}/api/v1/meter/pass`);
    assert.equal(calls[1]?.url, `${DEFAULT_METER_ORIGIN}/api/v1/meter/watch`);
  });

  it("buyMeterPass sends an optional sku and refuses the receive wallet", async () => {
    const payer = Keypair.generate();
    let passBody = "";
    const bought = await buyMeterPass({
      keypair: payer,
      sku: "pass_24h",
      fetch: async (_url, init) => {
        if (!passBody) {
          passBody = init?.body ?? "";
          return jsonResponse(invoice({ sku: "pass_24h" }), 402);
        }
        return jsonResponse({ token: "acp_24h", invoice_id: "inv_202f5a771d4c6f77" });
      },
      pay: async () => ({ signature: "sig", invoice_id: "inv_202f5a771d4c6f77" }),
      sleep: async () => {},
    });
    assert.deepEqual(JSON.parse(passBody), { sku: "pass_24h" });
    assert.equal(bought.token, "acp_24h");

    const receiveSigner = {
      publicKey: new PublicKey(LOCKED_SOLANA_PAY_TO),
      secretKey: new Uint8Array(64),
    };
    await assert.rejects(
      () =>
        buyMeterPass({
          keypair: receiveSigner,
          fetch: async () => jsonResponse(invoice(), 402),
        }),
      /receive wallet/i,
    );
  });
});
