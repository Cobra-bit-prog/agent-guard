import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import {
  FEATURED_DAYS,
  FEATURED_HONESTY,
  FEATURED_LINE,
  FEATURED_PRICE_USD,
  FEATURED_SKU,
} from "./featured-copy.ts";
import { handleFeaturedRequest } from "./featured-http.ts";
import { grantFeatured, startFeaturedPay } from "./featured.ts";
import { FEATURED_INVOICE_EXAMPLE, FEATURED_PRICE_EXAMPLE, SKILL_MD } from "./self-list.ts";
import { createListing, listVisibleListings, type ListingQuery } from "./listings.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const LISTINGS = readFileSync(join(ROOT, "migrations/0027_agent_listings.sql"), "utf8");
const FEATURED = readFileSync(join(ROOT, "migrations/0033_agent_listing_featured.sql"), "utf8");
const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

async function openDb(withFeatured = true): Promise<{ db: PGlite; sql: ListingQuery }> {
  const db = new PGlite();
  await db.exec(LISTINGS);
  if (withFeatured) await db.exec(FEATURED);
  return { db, sql: wrap(db) };
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada",
    skills: "research, writing",
    pitch: "I read the tickets and write a short note.",
    contact: "ada@example.com",
    link: "https://example.com/ada",
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("https://agent-control.net/api/v1/agents/listings/featured", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("featured price lock", () => {
  it("is $19 USDC for 7 days and keeps the fee", () => {
    assert.equal(FEATURED_SKU, "featured_7d");
    assert.equal(FEATURED_PRICE_USD, 19);
    assert.equal(FEATURED_DAYS, 7);
    assert.equal(
      FEATURED_LINE,
      "Listing is free. Pay $19 to pin your agent at the top for 7 days.",
    );
    assert.equal(FEATURED_HONESTY, "We keep the fee. You pay us directly in USDC.");
    assert.doesNotMatch(
      `${FEATURED_LINE} ${FEATURED_HONESTY}`,
      /escrow|refund|\bhold\b|kept safe|\$49|\/month/i,
    );
  });
});

describe("featured payment on a throwaway database", () => {
  it("pays the locked Meter wallets and pins the listing for 7 days", async () => {
    const { sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, "ip");
    const started = await handleFeaturedRequest(
      post({
        listing_id: row.id,
        contact: "Ada@Example.com",
        pay_to: "not-our-wallet",
        amount_usd: 49,
      }),
      sql,
      {},
      NOW,
    );
    assert.equal(started.status, 402);
    const invoice = (await started.json()) as {
      invoice_id: string;
      reference: string;
      pay_to: string;
      base_pay_to: string;
      amount_usd: number;
      sku: string;
      amount_base_units: string;
    };
    assert.equal(invoice.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(invoice.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(invoice.amount_usd, 19);
    assert.equal(invoice.sku, "featured_7d");
    assert.equal(invoice.amount_base_units, "19000000");
    assert.notEqual(invoice.pay_to, "not-our-wallet");

    const paid = await handleFeaturedRequest(
      post({ invoice_id: invoice.invoice_id }),
      sql,
      {
        findPayment: async () => ({ kind: "paid", signature: "tx-sol", amountUsdc: 19 }),
      },
      NOW,
    );
    assert.equal(paid.status, 200);
    const body = (await paid.json()) as {
      status: string;
      featured: boolean;
      featured_until: string;
      tx_ref: string;
    };
    assert.equal(body.status, "paid");
    assert.equal(body.featured, true);
    assert.equal(body.tx_ref, "tx-sol");
    assert.equal(new Date(body.featured_until).getTime(), NOW.getTime() + 7 * DAY);

    const again = await handleFeaturedRequest(
      post({ invoice_id: invoice.invoice_id }),
      sql,
      {
        findPayment: async () => ({ kind: "paid", signature: "tx-sol-2", amountUsdc: 19 }),
      },
      new Date(NOW.getTime() + DAY),
    );
    const second = (await again.json()) as { featured_until: string };
    assert.equal(new Date(second.featured_until).getTime(), NOW.getTime() + 7 * DAY);

    const visible = await listVisibleListings(sql, NOW);
    assert.equal(visible[0]?.id, row.id);
    assert.equal(visible[0]?.featured, true);
    assert.equal("ip_hash" in (visible[0] ?? {}), false);
  });

  it("adds 7 days after the current pin, and starts from now when the pin has ended", async () => {
    const { db, sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, "ip");
    const first = await startFeaturedPay(
      sql,
      { listing_id: row.id, contact: row.contact },
      NOW,
      "ip",
    );
    const granted = await grantFeatured(sql, first.id, { chain: "solana", txRef: "tx1", now: NOW });
    assert.equal(granted?.featured_until, new Date(NOW.getTime() + 7 * DAY).toISOString());

    const later = new Date(NOW.getTime() + DAY);
    const second = await startFeaturedPay(
      sql,
      { listing_id: row.id, contact: row.contact },
      later,
      "ip",
    );
    assert.notEqual(second.id, first.id);
    const extended = await grantFeatured(sql, second.id, {
      chain: "base",
      txRef: "0xbase",
      now: later,
    });
    assert.equal(extended?.order.chain, "base");
    assert.equal(new Date(extended?.featured_until ?? 0).getTime(), NOW.getTime() + 14 * DAY);

    const past = new Date(NOW.getTime() - DAY);
    await db.query("update agent_listings set featured_until = $2 where id = $1", [row.id, past]);
    const third = await startFeaturedPay(
      sql,
      { listing_id: row.id, contact: row.contact },
      NOW,
      "other-ip",
    );
    const restarted = await grantFeatured(sql, third.id, {
      chain: "solana",
      txRef: "tx3",
      now: NOW,
    });
    assert.equal(new Date(restarted?.featured_until ?? 0).getTime(), NOW.getTime() + 7 * DAY);
  });

  it("rejects a mismatched contact, a short payment, and the honeypot", async () => {
    const { sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, "ip");
    const mismatch = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: "other@example.com" }),
      sql,
      {},
      NOW,
    );
    assert.equal(mismatch.status, 400);
    assert.match(((await mismatch.json()) as { error: string }).error, /does not match/);

    const started = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: row.contact }),
      sql,
      {},
      NOW,
    );
    const invoice = (await started.json()) as { invoice_id: string };
    const short = await handleFeaturedRequest(
      post({ invoice_id: invoice.invoice_id }),
      sql,
      { findPayment: async () => ({ kind: "underpaid", signature: "short", amountUsdc: 1 }) },
      NOW,
    );
    assert.equal(short.status, 402);
    const shortBody = (await short.json()) as { status: string; featured: boolean };
    assert.equal(shortBody.status, "underpaid");
    assert.equal(shortBody.featured, false);

    const spam = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: row.contact, company_website: "https://spam.example" }),
      sql,
      {},
      NOW,
    );
    assert.equal(spam.status, 400);

    const base = await startFeaturedPay(
      sql,
      { listing_id: row.id, contact: row.contact },
      new Date(NOW.getTime() + 60_000),
      "ip-2",
    );
    const settled = await handleFeaturedRequest(
      post({
        invoice_id: base.id,
        payment: {
          authorization: {
            from: "0x2222222222222222222222222222222222222222",
            to: EVM_PAYOUT_ADDRESS,
            value: "19000000",
          },
          signature: `0x${"11".repeat(65)}`,
        },
      }),
      sql,
      { settleExactEvm: async () => ({ ok: true, transaction: "0xbase", payer: "0xpayer" }) },
      NOW,
    );
    assert.equal(settled.status, 200);
    const settledBody = (await settled.json()) as { status: string; featured: boolean };
    assert.equal(settledBody.status, "paid");
    assert.equal(settledBody.featured, true);
  });

  it("lists a featured agent ahead of a newer free listing", async () => {
    const { sql } = await openDb();
    const older = await createListing(sql, listing({ name: "Older" }), NOW, "ip");
    await createListing(
      sql,
      listing({ name: "Newer", contact: "newer@example.com" }),
      new Date(NOW.getTime() + 1000),
      "ip",
    );
    const order = await startFeaturedPay(
      sql,
      { listing_id: older.id, contact: older.contact },
      NOW,
      "ip",
    );
    await grantFeatured(sql, order.id, { chain: "solana", txRef: "tx", now: NOW });
    const visible = await listVisibleListings(sql, NOW);
    assert.deepEqual(
      visible.map((row) => row.name),
      ["Older", "Newer"],
    );
    assert.equal(visible[0]?.featured, true);
    assert.equal(visible[1]?.featured, false);
  });

  it("still lists agents when the featured column is not on the database yet", async () => {
    const { sql } = await openDb(false);
    const row = await createListing(sql, listing(), NOW, "ip");
    const visible = await listVisibleListings(sql, NOW);
    assert.equal(visible.length, 1);
    assert.equal(visible[0]?.featured, false);
    assert.equal(visible[0]?.featured_until, null);
    const blocked = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: row.contact }),
      sql,
      {},
      NOW,
    );
    assert.equal(blocked.status, 503);
  });
});

describe("featured skill matches the live endpoint", () => {
  it("documents the real price body and the real 402 invoice", async () => {
    const { sql } = await openDb();
    const row = await createListing(sql, listing(), NOW, "ip");
    const priced = await handleFeaturedRequest(
      new Request("https://agent-control.net/api/v1/agents/listings/featured", { method: "GET" }),
      sql,
      {},
      NOW,
    );
    assert.equal(priced.status, 200);
    const price = (await priced.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(price).sort(), Object.keys(FEATURED_PRICE_EXAMPLE).sort());
    assert.equal(price.pay_to, FEATURED_PRICE_EXAMPLE.pay_to);
    assert.equal(price.base_pay_to, FEATURED_PRICE_EXAMPLE.base_pay_to);
    assert.equal(price.amount_base_units, FEATURED_PRICE_EXAMPLE.amount_base_units);
    assert.deepEqual(price.chains, [...FEATURED_PRICE_EXAMPLE.chains]);
    assert.ok(SKILL_MD.includes(JSON.stringify(FEATURED_PRICE_EXAMPLE)));

    const started = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: row.contact }),
      sql,
      {},
      NOW,
    );
    assert.equal(started.status, 402);
    const body = (await started.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), Object.keys(FEATURED_INVOICE_EXAMPLE).sort());
    assert.equal(body.pay_to, FEATURED_INVOICE_EXAMPLE.pay_to);
    assert.equal(body.base_pay_to, FEATURED_INVOICE_EXAMPLE.base_pay_to);
    assert.equal(body.amount_base_units, FEATURED_INVOICE_EXAMPLE.amount_base_units);
    assert.equal(body.status, "pending");
    assert.equal(body.sku, FEATURED_INVOICE_EXAMPLE.sku);
    const liveAccepts = body.accepts as Array<Record<string, unknown>>;
    assert.equal(liveAccepts.length, FEATURED_INVOICE_EXAMPLE.accepts.length);
    for (let i = 0; i < liveAccepts.length; i += 1) {
      const live = liveAccepts[i];
      const documented = FEATURED_INVOICE_EXAMPLE.accepts[i];
      if (!live || !documented) throw new Error("missing accept");
      assert.deepEqual(Object.keys(live).sort(), Object.keys(documented).sort());
      assert.equal(live.network, documented.network);
      assert.equal(live.payTo, documented.payTo);
      assert.equal(live.asset, documented.asset);
      assert.equal(live.amount, documented.amount);
      const liveExtra = live.extra as Record<string, unknown>;
      assert.deepEqual(Object.keys(liveExtra).sort(), Object.keys(documented.extra).sort());
    }
    assert.ok(SKILL_MD.includes(JSON.stringify(FEATURED_INVOICE_EXAMPLE)));
    assert.match(SKILL_MD, /HTTP 402/);
    assert.match(SKILL_MD, /does not return HTTP 402/);

    const mismatch = await handleFeaturedRequest(
      post({ listing_id: row.id, contact: "other@example.com" }),
      sql,
      {},
      NOW,
    );
    const mismatchError = ((await mismatch.json()) as { error: string }).error;
    assert.ok(SKILL_MD.includes(mismatchError));
  });
});

describe("directory featured copy", () => {
  it("keeps the free list and does not say hold, escrow, or refund", () => {
    const page = readFileSync(join(ROOT, "src/routes/directory.tsx"), "utf8");
    const panel = readFileSync(join(ROOT, "src/components/directory-featured.tsx"), "utf8");
    const copy = readFileSync(join(ROOT, "src/lib/directory/featured-copy.ts"), "utf8");
    const combined = `${page}\n${panel}`;
    assert.match(page, /FEATURED_LINE/);
    assert.match(page, /FEATURED_HONESTY/);
    assert.match(page, /LISTED_FREE_LINE/);
    assert.match(page, /ACTION_GATE_SUCCESS_LINE/);
    assert.match(page, /Listing your agent is free\. People reach you at the contact you leave\./);
    assert.match(page, /Featured/);
    assert.match(copy, /Pay on Base or Solana/);
    assert.match(copy, /Feature this listing — \$19 USDC \/ 7 days/);
    assert.match(copy, /Feature it for \$19/);
    assert.match(panel, /trackFeaturedStart/);
    assert.match(panel, /FEATURED_PAY_LINE/);
    assert.match(panel, /FEATURED_CTA/);
    assert.match(panel, /Get featured/);
    assert.match(panel, /SOLANA_PAYOUT_ADDRESS/);
    assert.match(panel, /EVM_PAYOUT_ADDRESS/);
    assert.doesNotMatch(panel, /featured_7d|\$49|\/month|escrow|refund|\bhold\b|kept safe/i);
    assert.match(page, /ACTION_GATE_HREF/);
    assert.doesNotMatch(page, /featured_7d|\/month|escrow|refund|\bhold\b|kept safe/i);
    const priced = page.match(/\$49/g) ?? [];
    const hireLine = page.match(/Hire us · directory boost is \$49/g) ?? [];
    assert.ok(hireLine.length >= 1);
    assert.equal(priced.length, hireLine.length);
    assert.doesNotMatch(
      combined,
      /escrow|\bfunded\b|\bhirer\b|\bsignature\b|\bsettlement\b|\bprotocol\b|\brail\b/i,
    );
  });
});
