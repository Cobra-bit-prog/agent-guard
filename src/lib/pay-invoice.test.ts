import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLANS } from "./plans.ts";
import { USDC_MINT, assertPayerIsNotReceiveWallet, buildSolanaPayUrl, usdcBaseUnits } from "./solana-pay.ts";
import { newPayReference } from "./pay-invoice.ts";
import {
  SOLANA_PAYOUT_ADDRESS,
  copyFor,
  isForbiddenCustomerWord,
  lockedSolanaUsdcRecipient,
  matchUsdcByReference,
  paymentsFromHeliusPayload,
  receiveWallet,
  viewInvoice,
} from "./pay-invoice.ts";

describe("plans are exact dollars, not unique dust", () => {
  it("uses 29 / 49 / 149 USDC base units", () => {
    assert.equal(PLANS.starter.price, 29);
    assert.equal(PLANS.pro.price, 49);
    assert.equal(PLANS.team.price, 149);
    assert.equal(usdcBaseUnits(29), "29000000");
    assert.equal(usdcBaseUnits(0.25), "250000");
    assert.equal(usdcBaseUnits(0.1), "100000");
    assert.notEqual(String(PLANS.starter.price), "29.000137");
  });
});

describe("copy uses customer words only", () => {
  it("locks Pay $29 copy and bans watcher language", () => {
    const c = copyFor(29);
    assert.equal(c.title, "Pay $29. Console stays on.");
    assert.equal(c.body, "Send $29 USDC on Solana. We unlock when it lands.");
    assert.equal(c.cta, "Pay $29");
    assert.equal(c.waiting, "Waiting for $29 USDC on Solana.");
    assert.equal(c.done, "Paid. Console is open.");
    assert.equal(c.warn, "Use a wallet. Do not send from Coinbase or Binance.");
    assert.equal(c.trialMail, "Your day is almost up. Pay $29 USDC on Solana to keep the console.");
    for (const value of Object.values(c)) {
      assert.equal(isForbiddenCustomerWord(value), false);
    }
    assert.equal(copyFor(49).cta, "Pay $49");
    assert.equal(copyFor(149).cta, "Pay $149");
  });
});

describe("Solana Pay URL", () => {
  it("is $29 plus a unique reference to the Phantom receive wallet", () => {
    const a = newPayReference();
    const b = newPayReference();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32 && a.length <= 44, a);
    assert.ok(b.length >= 32 && b.length <= 44, b);
    const url = buildSolanaPayUrl({
      recipient: "WrongWalletDoNotUse111111111111111111111",
      amountUsdc: 29,
      reference: a,
      planName: "Starter",
    });
    assert.match(url, /^solana:49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR\?/);
    assert.match(url, /amount=29/);
    assert.doesNotMatch(url, /29\.000/);
    assert.doesNotMatch(url, /WrongWallet/);
    assert.match(url, new RegExp(`spl-token=${USDC_MINT}`));
    assert.match(url, new RegExp(`reference=${a}`));
    assert.equal(SOLANA_PAYOUT_ADDRESS, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.equal(receiveWallet("SomeOtherWallet111111111111111111111111"), SOLANA_PAYOUT_ADDRESS);
    assert.equal(
      lockedSolanaUsdcRecipient("preview-env-wrong-wallet"),
      "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR",
    );
  });

  it("refuses Phantom pay when the connected wallet is the receive address", () => {
    assert.throws(
      () => assertPayerIsNotReceiveWallet(SOLANA_PAYOUT_ADDRESS),
      /Switch to a different wallet in Phantom/,
    );
    assert.throws(
      () => assertPayerIsNotReceiveWallet(` ${SOLANA_PAYOUT_ADDRESS} `),
      /This wallet is the receive address/,
    );
    assert.doesNotThrow(() => assertPayerIsNotReceiveWallet("SomeOtherWallet111111111111111111111111"));
    assert.equal(isForbiddenCustomerWord("This wallet is the receive address. Switch to a different wallet in Phantom, then pay."), false);
  });
});

function usdcTx(owner: string, amountBase: number) {
  return {
    meta: {
      preTokenBalances: [{ mint: USDC_MINT, owner, uiTokenAmount: { amount: "0" } }],
      postTokenBalances: [
        { mint: USDC_MINT, owner, uiTokenAmount: { amount: String(amountBase) } },
      ],
    },
  };
}

describe("payment matches by reference without a special amount", () => {
  it("pays on exact $29 USDC to the locked recipient", () => {
    const paid = matchUsdcByReference({
      recipient: SOLANA_PAYOUT_ADDRESS,
      amountUsdc: 29,
      signatures: [{ signature: "sigPaid", tx: usdcTx(SOLANA_PAYOUT_ADDRESS, 29_000_000) }],
    });
    assert.equal(paid.kind, "paid");
    if (paid.kind !== "paid") return;
    assert.equal(paid.signature, "sigPaid");
    assert.equal(paid.amountUsdc, 29);

    const otherInvoice = matchUsdcByReference({
      recipient: SOLANA_PAYOUT_ADDRESS,
      amountUsdc: 29,
      signatures: [],
    });
    assert.equal(otherInvoice.kind, "none");

    const uniqueDustWouldHaveBeen = 29_000_137;
    const exactPlan = matchUsdcByReference({
      recipient: SOLANA_PAYOUT_ADDRESS,
      amountUsdc: 29,
      signatures: [{ signature: "sigExact", tx: usdcTx(SOLANA_PAYOUT_ADDRESS, 29_000_000) }],
    });
    assert.equal(exactPlan.kind, "paid");
    assert.notEqual(uniqueDustWouldHaveBeen, 29_000_000);

    const ignoredCallerWallet = matchUsdcByReference({
      recipient: "WrongWalletDoNotUse111111111111111111111",
      amountUsdc: 29,
      signatures: [{ signature: "sigLock", tx: usdcTx(SOLANA_PAYOUT_ADDRESS, 29_000_000) }],
    });
    assert.equal(ignoredCallerWallet.kind, "paid");
  });
});

describe("Helius webhook", () => {
  it("matches the Solana Pay reference, not amount dust", () => {
    const reference = "HelRef11111111111111111111111111111111111";
    const body = [
      {
        signature: "heliusSig",
        accountData: [{ account: SOLANA_PAYOUT_ADDRESS }, { account: reference }],
        tokenTransfers: [
          {
            mint: USDC_MINT,
            toUserAccount: SOLANA_PAYOUT_ADDRESS,
            tokenAmount: 29,
          },
        ],
      },
    ];
    const payments = paymentsFromHeliusPayload(body, "WrongWalletDoNotUse111111111111111111111");
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.amountUsdc, 29);
    assert.ok(payments[0]?.references.includes(reference));
  });

  it("does not match by USDC amount alone without the Solana Pay reference", () => {
    const payments = paymentsFromHeliusPayload(
      [
        {
          signature: "amtOnly",
          accountData: [{ account: SOLANA_PAYOUT_ADDRESS }],
          tokenTransfers: [
            {
              mint: USDC_MINT,
              toUserAccount: SOLANA_PAYOUT_ADDRESS,
              tokenAmount: 29,
            },
          ],
        },
      ],
      SOLANA_PAYOUT_ADDRESS,
    );
    assert.equal(payments[0]?.amountUsdc, 29);
    assert.deepEqual(payments[0]?.references, [SOLANA_PAYOUT_ADDRESS]);
    assert.equal(payments[0]?.references.includes("HelRef11111111111111111111111111111111111"), false);
  });
});

describe("invoice view", () => {
  it("always names the Phantom receive pubkey", () => {
    const view = viewInvoice(
      {
        id: "inv_test",
        plan: "starter",
        recipient: "SomeOtherWallet111111111111111111111111",
        reference: "Ref111111111111111111111111111111111111111",
        status: "pending",
        email: "ops@example.com",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      "https://example.test",
    );
    assert.equal(view.recipient, "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR");
    assert.match(view.pay_url, /^solana:49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR\?/);
    assert.equal(view.amount_usdc, 29);
    assert.equal(view.human_url, "https://example.test/billing/pay?id=inv_test");
    assert.equal(view.match, "solana-pay-reference");
    assert.equal(view.no_unique_amount, true);
  });
});
