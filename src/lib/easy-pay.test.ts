import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cardConfigured,
  createCardSession,
  humanPayOptions,
  planFromCardRequest,
} from "./easy-pay.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function withoutStripe() {
  delete process.env.STRIPE_SECRET_KEY;
}

describe("easier human pay", () => {
  it("quotes Base and Solana without Stripe", () => {
    withoutStripe();
    const hit = humanPayOptions("starter");
    assert.equal(hit.plan, "starter");
    assert.equal(hit.amount_usd, 29);
    assert.equal(hit.card.ready, false);
    assert.equal(hit.base.chain, "base");
    assert.equal(hit.base.amount_usd, 29);
    assert.equal(hit.base.note, "Same $29 on Base USDC if you already have Coinbase / MetaMask.");
    assert.equal(hit.solana.amount_usd, 29);
    assert.match(hit.solana.pay_url, /[?&]amount=29(?:&|$)/);
    assert.match(hit.solana.pay_url, /message=Pay\+%2429(?:&|$)/);
    assert.ok(hit.solana.pay_to);
    assert.equal(cardConfigured(), false);
    assert.equal(humanPayOptions("pro").amount_usd, 49);
    assert.equal(humanPayOptions("team").amount_usd, 149);
  });

  it("quotes Action Gate at $49 for plan=action and its documented alias", () => {
    withoutStripe();
    for (const alias of ["action", "ACTION", " Action "]) {
      const hit = humanPayOptions(alias);
      assert.equal(hit.plan, "action");
      assert.equal(hit.amount_usd, 49);
      assert.equal(hit.card.ready, false);
      assert.equal(
        hit.card.note,
        "Card is off until Stripe is connected. Pay with a wallet you already have.",
      );
      assert.equal(hit.base.amount_usd, 49);
      assert.equal(hit.base.note, "Same $49 on Base USDC if you already have Coinbase / MetaMask.");
      assert.equal(hit.solana.amount_usd, 49);
      assert.match(hit.solana.pay_url, /[?&]amount=49(?:&|$)/);
      assert.match(hit.solana.pay_url, /message=Pay\+%2449(?:&|$)/);
      assert.doesNotMatch(hit.base.note, /\$29/);
      assert.doesNotMatch(hit.solana.pay_url, /(?:^|[?&])amount=29(?:&|$)/);
      assert.doesNotMatch(hit.solana.pay_url, /Pay\+%2429/);
    }
  });

  it("keeps card checkout off when Stripe is unset, including plan=action", async () => {
    withoutStripe();
    const session = await createCardSession("action");
    assert.equal(session.ok, false);
    if (session.ok) return;
    assert.equal(session.http, 501);
    assert.equal(session.pay.plan, "action");
    assert.equal(session.pay.amount_usd, 49);
    assert.equal(session.pay.card.ready, false);
    assert.equal(session.pay.base.amount_usd, 49);
    assert.equal(session.pay.solana.amount_usd, 49);
  });

  it("reads plan from the card request the route already serves", () => {
    const request = new Request("https://agent-control.net/api/v1/billing/card?plan=ACTION");
    assert.equal(planFromCardRequest(request), "ACTION");
    const quoted = humanPayOptions(planFromCardRequest(request));
    assert.equal(quoted.plan, "action");
    assert.equal(quoted.amount_usd, 49);
    assert.equal(planFromCardRequest(request, "starter"), "starter");
    const missing = new Request("https://agent-control.net/api/v1/billing/card");
    assert.equal(humanPayOptions(planFromCardRequest(missing)).plan, "starter");
    assert.equal(humanPayOptions(planFromCardRequest(missing)).amount_usd, 29);

    const route = readFileSync(join(ROOT, "src/routes/api/v1/billing.card.ts"), "utf8");
    assert.match(route, /humanPayOptions\(planFromCardRequest\(request\)\)/);
    assert.match(route, /createCardSession\(planFromCardRequest\(request, body\.plan\)\)/);
    assert.doesNotMatch(route, /humanPayOptions\("starter"\)/);
  });
});
