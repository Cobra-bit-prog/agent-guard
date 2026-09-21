import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METER_LAPTOP_PAY_PATH,
  METER_LAPTOP_PAY_URL,
  meterLaptopPayCreateBody,
  meterLaptopPayHref,
  parseMeterPaySearch,
  resolveMeterPayIntent,
} from "./meter-pay.ts";
import {
  METER_LOOK_SKU,
  METER_LOOK_USD_LABEL,
  METER_LOOKS_20_USD_LABEL,
  METER_PAID_SKU,
} from "./meter/pricing.ts";
import {
  SOLANA_PAYOUT_ADDRESS,
  USDC_MINT,
  buildSolanaPayUrl,
  parseSolanaPayUrl,
  usdcBaseUnits,
} from "./solana-pay.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REF = "HF57Ln9oqXT22zgj2b4fBsbVoMtPndE6rYmAMVhs78Yj";

describe("meter laptop pay", () => {
  it("locks the Phantom receive wallet even when pay_url names another", () => {
    const hostile = buildSolanaPayUrl({
      recipient: "WrongWalletDoNotUse111111111111111111111",
      amountUsdc: 0.25,
      reference: REF,
    });
    assert.match(hostile, new RegExp(`^solana:${SOLANA_PAYOUT_ADDRESS}\\?`));
    const parsed = parseSolanaPayUrl(
      `solana:WrongWalletDoNotUse111111111111111111111?amount=0.25&spl-token=${USDC_MINT}&reference=${REF}`,
    );
    assert.ok(parsed);
    assert.equal(parsed.recipient, SOLANA_PAYOUT_ADDRESS);
    assert.equal(parsed.amountUsdc, 0.25);
    assert.equal(parsed.reference, REF);
    assert.doesNotMatch(parsed.payUrl, /WrongWallet/);

    const intent = resolveMeterPayIntent({
      search: parseMeterPaySearch({
        pay_url: hostile,
        pay_to: "EvilPayTo1111111111111111111111111111111",
      }),
    });
    assert.equal(intent.ok, true);
    if (!intent.ok) return;
    assert.equal(intent.intent.recipient, SOLANA_PAYOUT_ADDRESS);
    assert.equal(intent.intent.amountUsdc, 0.25);
    assert.equal(intent.intent.reference, REF);
    assert.equal(intent.intent.amountBaseUnits, "250000");
  });

  it("resolves invoice_id + reference query and ignores pay_to", () => {
    const search = parseMeterPaySearch({
      invoice_id: "inv_202f5a771d4c6f77",
      amount: "0.25",
      reference: REF,
      pay_to: "ShouldNeverReceive111111111111111111111",
    });
    assert.equal(search.invoice_id, "inv_202f5a771d4c6f77");
    assert.equal(search.pay_url, undefined);
    const intent = resolveMeterPayIntent({ search });
    assert.equal(intent.ok, true);
    if (!intent.ok) return;
    assert.equal(intent.intent.invoiceId, "inv_202f5a771d4c6f77");
    assert.equal(intent.intent.recipient, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(usdcBaseUnits(0.25), "250000");
    assert.equal(meterLaptopPayHref("inv_202f5a771d4c6f77"), "/meter/pay?invoice_id=inv_202f5a771d4c6f77");
    assert.equal(METER_LAPTOP_PAY_PATH, "/meter/pay");
    assert.equal(METER_LAPTOP_PAY_URL, "https://agent-control.net/meter/pay");
  });

  it("prefers invoice amount and reference over a hostile query", () => {
    const intent = resolveMeterPayIntent({
      search: parseMeterPaySearch({
        invoice_id: "inv_other",
        amount: "99",
        reference: "11111111111111111111111111111111",
      }),
      invoice: {
        invoice_id: "inv_202f5a771d4c6f77",
        amount_usd: 0.25,
        amount_base_units: "250000",
        reference: REF,
        pay_to: "WrongWalletDoNotUse111111111111111111111",
      },
    });
    assert.equal(intent.ok, true);
    if (!intent.ok) return;
    assert.equal(intent.intent.invoiceId, "inv_202f5a771d4c6f77");
    assert.equal(intent.intent.amountUsdc, 0.25);
    assert.equal(intent.intent.amountBaseUnits, "250000");
    assert.equal(intent.intent.reference, REF);
    assert.equal(intent.intent.recipient, SOLANA_PAYOUT_ADDRESS);
  });

  it("default laptop create body is empty looks_20; look is opt-in", () => {
    assert.deepEqual(meterLaptopPayCreateBody(), {});
    assert.deepEqual(meterLaptopPayCreateBody(METER_LOOK_SKU), { sku: METER_LOOK_SKU });
    assert.equal(METER_PAID_SKU, "looks_20");
    assert.equal(METER_LOOKS_20_USD_LABEL, "0.20");
    assert.equal(METER_LOOK_USD_LABEL, "0.10");
  });

  it("honors a look invoice amount and does not rewrite it to looks_20", () => {
    const intent = resolveMeterPayIntent({
      search: parseMeterPaySearch({ invoice_id: "inv_look", amount: "0.20" }),
      invoice: {
        invoice_id: "inv_look",
        amount_usd: 0.1,
        amount_base_units: "100000",
        reference: REF,
      },
    });
    assert.equal(intent.ok, true);
    if (!intent.ok) return;
    assert.equal(intent.intent.invoiceId, "inv_look");
    assert.equal(intent.intent.amountUsdc, 0.1);
    assert.equal(intent.intent.amountBaseUnits, "100000");
  });

  it("honors a looks_20 invoice amount", () => {
    const intent = resolveMeterPayIntent({
      search: parseMeterPaySearch({ invoice_id: "inv_pack" }),
      invoice: {
        invoice_id: "inv_pack",
        amount_usd: 0.2,
        amount_base_units: "200000",
        reference: REF,
      },
    });
    assert.equal(intent.ok, true);
    if (!intent.ok) return;
    assert.equal(intent.intent.amountUsdc, 0.2);
    assert.equal(intent.intent.amountBaseUnits, "200000");
  });

  it("ships a public /meter/pay route that does not import pay-extension at the top", () => {
    const route = readFileSync(join(ROOT, "src/routes/meter.pay.tsx"), "utf8");
    const card = readFileSync(join(ROOT, "src/components/meter-pay-card.tsx"), "utf8");
    assert.match(route, /createFileRoute\("\/meter\/pay"\)/);
    assert.match(route, /SkyShell/);
    assert.match(route, /MeterPayCard/);
    assert.match(route, /Pay \$\{METER_LOOKS_20_USD_LABEL\} USDC/);
    assert.match(route, /One look is \$\$\{METER_LOOK_USD_LABEL\}/);
    assert.doesNotMatch(route, /Pay 0\.10 USDC/);
    assert.doesNotMatch(route, /from\s+["'][^"']*pay-extension["']/);
    assert.match(card, /payUsdcWithPhantomExtension/);
    assert.match(card, /import\("@\/lib\/pay-extension"\)/);
    assert.match(card, /\/api\/v1\/meter\/watch/);
    assert.match(card, /\/api\/v1\/meter\/invoice\//);
    assert.match(card, /meterLaptopPayCreateBody/);
    assert.match(card, /Get a \$\$\{METER_LOOKS_20_USD_LABEL\} pack/);
    assert.match(card, /Or one look for \$\$\{METER_LOOK_USD_LABEL\}/);
    assert.match(card, /onCreateLook=\{\(\) => void onCreateInvoice\(METER_LOOK_SKU\)\}/);
    assert.match(card, /onCreatePack=\{\(\) => void onCreateInvoice\(\)\}/);
    assert.doesNotMatch(card, /Get a \$\$\{METER_LOOK_USD_LABEL\} invoice/);
    assert.doesNotMatch(card, /from\s+["'][^"']*pay-extension["']/);
    assert.doesNotMatch(card, /pass_1h/);
    assert.doesNotMatch(card, /inbox/i);
    assert.doesNotMatch(card, /hold/i);
  });

  it("Phantom send refuses the locked receive wallet", () => {
    const ext = readFileSync(join(ROOT, "src/lib/pay-extension.ts"), "utf8");
    assert.match(ext, /assertPayerIsNotReceiveWallet\(payer\.toString\(\)\)/);
    assert.match(ext, /lockedSolanaUsdcRecipient/);
    assert.doesNotMatch(ext, /49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR/);
    const card = readFileSync(join(ROOT, "src/components/meter-pay-card.tsx"), "utf8");
    assert.match(card, /isReceiveWalletPayer/);
    assert.match(card, /RECEIVE_WALLET_SWITCH_ERROR/);
    assert.match(card, /shortAddress\(connectedPubkey\)/);
  });
});
