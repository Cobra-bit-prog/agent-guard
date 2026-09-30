import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardConfigured, humanPayOptions } from "./easy-pay.ts";

describe("easier human pay", () => {
  it("quotes Base and Solana without Stripe", () => {
    delete process.env.STRIPE_SECRET_KEY;
    const hit = humanPayOptions("starter");
    assert.equal(hit.amount_usd, 29);
    assert.equal(hit.card.ready, false);
    assert.equal(hit.base.chain, "base");
    assert.ok(hit.solana.pay_to);
    assert.equal(cardConfigured(), false);
  });
});
