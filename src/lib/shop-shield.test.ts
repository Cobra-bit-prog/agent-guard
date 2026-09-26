import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLANS } from "./plans.ts";
import { METER_FREE_LOOKS, METER_STAMP_TX } from "./meter/pricing.ts";
import {
  billingPaySearch,
  isForbiddenCustomerWord,
  viewInvoice,
  SOLANA_PAYOUT_ADDRESS,
} from "./pay-invoice.ts";
import { STAMP_RECIPE } from "./meter-recipe.ts";
import {
  SHOP_SHIELD_COPY,
  SHOP_SHIELD_PRICE_USD,
  SHOP_SHIELD_PRODUCT,
  SHOP_SHIELD_STAMP_NOTE,
  humanInboxPlan,
  parsePayPlan,
  payPlanQuote,
  shieldStatusFromSearch,
  type ShieldCustomer,
} from "./shop-shield.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-09-26T15:00:00.000Z");

function invoice(plan: string) {
  return viewInvoice(
    {
      id: "inv_shield",
      plan,
      recipient: "SomeOtherWallet111111111111111111111111",
      reference: "Ref111111111111111111111111111111111111111",
      status: "pending",
      expires_at: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    },
    "https://example.test",
  );
}

describe("Shop Shield plan", () => {
  it("prices plan=shield at $49 on the same Solana receive address", () => {
    assert.equal(SHOP_SHIELD_PRICE_USD, 49);
    assert.equal(payPlanQuote("shield").id, "shield");
    assert.equal(payPlanQuote("shield").name, "Shop Shield");
    assert.equal(payPlanQuote("SHIELD").price, 49);
    assert.equal(parsePayPlan("shield"), "shield");
    assert.equal(parsePayPlan("pro"), "pro");
    assert.equal(parsePayPlan("nope"), "starter");
    assert.equal(PLANS.starter.price, 29);
    assert.equal(PLANS.pro.price, 49);
    assert.equal(PLANS.team.price, 149);
    assert.equal(humanInboxPlan("shield"), null);
    assert.equal(humanInboxPlan("pro"), "pro");
    assert.equal(humanInboxPlan("starter"), "starter");
    assert.equal(METER_FREE_LOOKS, 0);
    assert.equal(METER_STAMP_TX.price_usd, 0.05);

    const view = invoice("shield");
    assert.equal(view.plan, "shield");
    assert.equal(view.amount_usdc, 49);
    assert.equal(view.amount_base_units, "49000000");
    assert.equal(view.exact_amount, "49");
    assert.equal(view.recipient, SOLANA_PAYOUT_ADDRESS);
    assert.match(view.pay_url, /^solana:49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR\?/);
    assert.match(view.pay_url, /amount=49(?:&|$)/);
    assert.equal(view.copy.title, SHOP_SHIELD_COPY.title);
    assert.match(view.copy.body, /five-cent ticket/);
    assert.match(view.copy.title, /Shop Shield/);
    assert.doesNotMatch(view.copy.title, /Console stays on/);
    assert.doesNotMatch(view.copy.body, /Pro Inbox/);
    for (const value of Object.values(view.copy)) {
      assert.equal(isForbiddenCustomerWord(value), false);
    }

    const pro = invoice("pro");
    assert.equal(pro.plan, "pro");
    assert.equal(pro.amount_usdc, 49);
    assert.equal(pro.copy.title, "Pay $49. Console stays on.");
  });

  it("accepts plan=shield on the pay page search without falling back to starter", () => {
    assert.deepEqual(billingPaySearch({ plan: "shield" }), { plan: "shield" });
    assert.deepEqual(billingPaySearch({ plan: "pro", id: " pay_1 " }), {
      plan: "pro",
      id: "pay_1",
    });
    assert.deepEqual(billingPaySearch({}), {});
    const pay = readFileSync(join(ROOT, "src/routes/_app/billing.pay.tsx"), "utf8");
    assert.match(pay, /billingPaySearch/);
    assert.doesNotMatch(pay, /parsePaidPlan/);
    const block = readFileSync(join(ROOT, "src/components/solana-pay-block.tsx"), "utf8");
    assert.match(block, /Shop Shield — gate \+ verify for your host\. Agents buy the five-cent ticket\./);
    assert.match(block, /text-title/);
    assert.match(block, /text-body/);
    assert.match(block, /text-meta/);
    assert.doesNotMatch(block, /text-\[\d+px\]/);
  });
});

describe("Shop Shield status", () => {
  const onFile = JSON.parse(readFileSync(join(ROOT, "src/data/shop-shield.json"), "utf8")) as {
    customers: ShieldCustomer[];
  };

  it("is off for everyone when the allowlist is empty", () => {
    assert.deepEqual(onFile.customers, []);
    const status = shieldStatusFromSearch({ seller: "acme" }, onFile.customers, NOW);
    assert.deepEqual(status, {
      on: false,
      seller: "acme",
      host: null,
      paid_until: null,
      product: SHOP_SHIELD_PRODUCT,
    });
    const missing = shieldStatusFromSearch({}, onFile.customers, NOW);
    assert.deepEqual(missing, { error: "Provide a seller or a host." });
  });

  it("turns on for a seller slug or host until paid_until, then off", () => {
    const customers: ShieldCustomer[] = [
      { seller: "Acme", host: "https://Pay.Acme.Example/checkout", paid_until: "2026-10-26" },
      { seller: "old", host: "old.example", paid_until: "2026-09-01" },
    ];
    assert.deepEqual(shieldStatusFromSearch({ seller: "acme" }, customers, NOW), {
      on: true,
      seller: "acme",
      host: "pay.acme.example",
      paid_until: "2026-10-26",
      product: "Shop Shield",
    });
    const byHost = shieldStatusFromSearch({ host: "pay.acme.example:443" }, customers, NOW);
    if ("error" in byHost) throw new Error(byHost.error);
    assert.equal(byHost.on, true);
    const expired = shieldStatusFromSearch({ seller: "old" }, customers, NOW);
    if ("error" in expired) throw new Error(expired.error);
    assert.equal(expired.on, false);
    assert.equal(expired.paid_until, "2026-09-01");
    const today = shieldStatusFromSearch(
      { seller: "acme" },
      [{ seller: "acme", paid_until: "2026-09-26" }],
      NOW,
    );
    if ("error" in today) throw new Error(today.error);
    assert.equal(today.on, true);
    const unknown = shieldStatusFromSearch({ seller: "missing" }, customers, NOW);
    if ("error" in unknown) throw new Error(unknown.error);
    assert.equal(unknown.on, false);
  });

  it("does not gate public stamp verify or the gate demo", () => {
    const gate = readFileSync(join(ROOT, "src/lib/meter/gate.ts"), "utf8");
    const http = readFileSync(join(ROOT, "src/lib/meter/http.ts"), "utf8");
    const demo = readFileSync(join(ROOT, "src/routes/api/v1/gate.demo.ts"), "utf8");
    for (const source of [gate, http, demo]) {
      assert.doesNotMatch(source, /shop-shield|shield\/status|SHOP_SHIELD/);
    }
    const route = readFileSync(join(ROOT, "src/routes/api/v1/shield.status.ts"), "utf8");
    const tree = readFileSync(join(ROOT, "src/routeTree.gen.ts"), "utf8");
    assert.match(route, /\/api\/v1\/shield\/status/);
    assert.match(tree, /\/api\/v1\/shield\/status/);
    assert.match(route, /shieldStatusFromSearch/);
    const home = readFileSync(join(ROOT, "src/routes/index.tsx"), "utf8");
    assert.doesNotMatch(home, /Shop Shield/);
    assert.match(STAMP_RECIPE, new RegExp(SHOP_SHIELD_STAMP_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(STAMP_RECIPE, /stamp_tx \$0\.05/);
    assert.match(STAMP_RECIPE, /merchant verifies free/);
  });
});
