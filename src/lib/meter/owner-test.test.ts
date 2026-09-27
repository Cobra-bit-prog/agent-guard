import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { METER_LOOKS_20, METER_STAMP_TX } from "./pricing.ts";
import {
  isOwnerTestInvoice,
  meterPaidAgentKey,
  OWNER_TEST_INVOICE_IDS,
  ownerTestInvoiceMatchSql,
  splitPaidMeterRows,
} from "./owner-test.ts";
import { createMeterStore } from "./store.ts";

const OWNER_A = "inv_a3191eb70ed24026";
const OWNER_B = "inv_202f5a771d4c6f77";
const THIRD_STAMP = "inv_1064d3be13d23d60";
const THIRD_LOOKS = "inv_e6b97e36e61af3c9";

describe("owner-test invoice allowlist", () => {
  it("tags the Sep 11 owner pair and leaves real third-party invoices untagged", () => {
    assert.deepEqual([...OWNER_TEST_INVOICE_IDS], [OWNER_A, OWNER_B]);
    assert.equal(isOwnerTestInvoice(OWNER_A), true);
    assert.equal(isOwnerTestInvoice(OWNER_B), true);
    assert.equal(isOwnerTestInvoice(THIRD_STAMP), false);
    assert.equal(isOwnerTestInvoice(THIRD_LOOKS), false);
    assert.equal(isOwnerTestInvoice(""), false);
    assert.equal(isOwnerTestInvoice(null), false);
  });

  it("builds a SQL id predicate that cannot pick up the real pays", () => {
    const sql = ownerTestInvoiceMatchSql();
    assert.match(sql, new RegExp(`'${OWNER_A}'`));
    assert.match(sql, new RegExp(`'${OWNER_B}'`));
    assert.doesNotMatch(sql, new RegExp(THIRD_STAMP));
    assert.doesNotMatch(sql, new RegExp(THIRD_LOOKS));
    assert.equal(sql.startsWith("id in ("), true);
    assert.throws(() => ownerTestInvoiceMatchSql("id; drop table meter_invoices"), /plain identifier/);
  });
});

describe("paid cohort split", () => {
  it("splits the known $0.75 book into $0.50 owner smoke and $0.25 third party", () => {
    const split = splitPaidMeterRows([
      {
        invoice_id: OWNER_A,
        payer_address: "OwnerWalletA",
        signature: "sig-owner-a",
        amount_usd: 0.25,
      },
      {
        invoice_id: OWNER_B,
        payer_address: "OwnerWalletB",
        signature: "sig-owner-b",
        amount_usd: 0.25,
      },
      {
        invoice_id: THIRD_STAMP,
        payer_address: "StampPayer",
        signature: "sig-stamp",
        amount_usd: 0.05,
      },
      {
        invoice_id: THIRD_LOOKS,
        payer_address: "LooksPayer",
        signature: "sig-looks",
        amount_usd: 0.2,
      },
    ]);
    assert.equal(split.invoices_paid_owner_test, 2);
    assert.equal(split.agents_paid_owner_test, 2);
    assert.equal(split.usdc_received_owner_test, 0.5);
    assert.equal(split.invoices_paid_third_party, 2);
    assert.equal(split.agents_paid_third_party, 2);
    assert.equal(split.usdc_received_third_party, 0.25);
    assert.equal(split.invoices_paid_owner_test + split.invoices_paid_third_party, 4);
    assert.equal(split.agents_paid_owner_test + split.agents_paid_third_party, 4);
    assert.equal(
      Number((split.usdc_received_owner_test + split.usdc_received_third_party).toFixed(6)),
      0.75,
    );
  });

  it("counts one wallet once inside a cohort and in both cohorts when it paid both", () => {
    const sameOwner = splitPaidMeterRows([
      { invoice_id: OWNER_A, payer_address: "OwnerWallet", signature: "sig-1", amount_usd: 0.25 },
      { invoice_id: OWNER_B, payer_address: "ownerwallet", signature: "sig-2", amount_usd: 0.25 },
    ]);
    assert.equal(sameOwner.invoices_paid_owner_test, 2);
    assert.equal(sameOwner.agents_paid_owner_test, 1);
    assert.equal(sameOwner.agents_paid_third_party, 0);

    const overlap = splitPaidMeterRows([
      { invoice_id: OWNER_A, payer_address: "SharedWallet", signature: "sig-owner", amount_usd: 0.25 },
      { invoice_id: THIRD_LOOKS, payer_address: "sharedwallet", signature: "sig-real", amount_usd: 0.2 },
    ]);
    assert.equal(overlap.agents_paid_owner_test, 1);
    assert.equal(overlap.agents_paid_third_party, 1);
    assert.equal(overlap.usdc_received_third_party, 0.2);
  });

  it("uses signature then invoice id when the payer address is blank", () => {
    assert.equal(
      meterPaidAgentKey({ invoice_id: OWNER_A, payer_address: "", signature: "SigOwner" }),
      "sigowner",
    );
    assert.equal(
      meterPaidAgentKey({ invoice_id: THIRD_STAMP, payer_address: null, signature: "" }),
      THIRD_STAMP,
    );
    const split = splitPaidMeterRows([
      { invoice_id: OWNER_A, payer_address: "", signature: "SigOwner", amount_usd: 0.25 },
      { invoice_id: THIRD_STAMP, payer_address: null, signature: null, amount_usd: 0.05 },
    ]);
    assert.equal(split.agents_paid_owner_test, 1);
    assert.equal(split.agents_paid_third_party, 1);
    assert.equal(split.usdc_received_third_party, 0.05);
  });
});

describe("memory meter report cohorts", () => {
  it("keeps raw paid totals and puts non-allowlisted pays entirely in third_party", async () => {
    const store = createMeterStore();
    const stamp = await store.createInvoice({ sku: METER_STAMP_TX.id });
    const looks = await store.createInvoice({ sku: METER_LOOKS_20.id });
    await store.createInvoice({ sku: METER_LOOKS_20.id });
    await store.fulfillInvoice(stamp.invoice_id, {
      signature: "sig-stamp",
      amountUsdc: METER_STAMP_TX.price_usd,
      payer_address: "ThirdStamp",
    });
    await store.fulfillInvoice(looks.invoice_id, {
      signature: "sig-looks",
      amountUsdc: METER_LOOKS_20.price_usd,
      payer_address: "ThirdLooks",
    });
    const report = await store.report();
    assert.equal(report.invoices_created, 3);
    assert.equal(report.invoices_paid, 2);
    assert.equal(report.agents_paid, 2);
    assert.equal(report.usdc_received, 0.25);
    assert.equal(report.invoices_paid_owner_test, 0);
    assert.equal(report.agents_paid_owner_test, 0);
    assert.equal(report.usdc_received_owner_test, 0);
    assert.equal(report.invoices_paid_third_party, report.invoices_paid);
    assert.equal(report.agents_paid_third_party, report.agents_paid);
    assert.equal(report.usdc_received_third_party, report.usdc_received);
    assert.equal(isOwnerTestInvoice(stamp.invoice_id), false);
    assert.equal(isOwnerTestInvoice(looks.invoice_id), false);
  });
});

describe("sql paid cohort query", () => {
  it("matches the Sep 11 book: raw $0.75 / 4 agents, third party $0.25 / 2 agents", async () => {
    const db = new PGlite();
    const ownerTestSql = ownerTestInvoiceMatchSql();
    await db.exec(`
      create table meter_invoices (
        id text primary key,
        status text not null,
        paid_amount_usd numeric,
        amount_usd numeric,
        payer_address text,
        signature text,
        expires_at timestamptz,
        source text,
        user_agent text
      );
      insert into meter_invoices
        (id, status, paid_amount_usd, amount_usd, payer_address, signature, expires_at, source)
      values
        ('${OWNER_A}', 'paid', 0.25, 0.25, 'OwnerWalletA', 'sig-owner-a', now() + interval '1 hour', 'http_pass'),
        ('${OWNER_B}', 'paid', 0.25, 0.25, 'OwnerWalletB', 'sig-owner-b', now() + interval '1 hour', 'http_pass'),
        ('${THIRD_STAMP}', 'paid', 0.05, 0.05, 'StampPayer', 'sig-stamp', now() + interval '1 hour', 'http_stamp'),
        ('${THIRD_LOOKS}', 'paid', 0.20, 0.20, 'LooksPayer', 'sig-looks', now() + interval '1 hour', 'http_pass'),
        ('inv_pending_real', 'pending', null, 0.20, null, null, now() + interval '1 hour', 'http_pass');
    `);
    const rows = await db.query<{
      invoices_paid: number;
      invoices_paid_owner_test: number;
      invoices_paid_third_party: number;
      usdc_received: string;
      usdc_received_owner_test: string;
      usdc_received_third_party: string;
      agents_paid: number;
      agents_paid_owner_test: number;
      agents_paid_third_party: number;
    }>(`
      select
        count(*) filter (where status = 'paid')::int as invoices_paid,
        count(*) filter (where status = 'paid' and ${ownerTestSql})::int as invoices_paid_owner_test,
        count(*) filter (where status = 'paid' and not (${ownerTestSql}))::int as invoices_paid_third_party,
        coalesce(sum(paid_amount_usd) filter (where status = 'paid'), 0) as usdc_received,
        coalesce(sum(paid_amount_usd) filter (where status = 'paid' and ${ownerTestSql}), 0) as usdc_received_owner_test,
        coalesce(sum(paid_amount_usd) filter (where status = 'paid' and not (${ownerTestSql})), 0) as usdc_received_third_party,
        count(distinct lower(coalesce(nullif(payer_address, ''), nullif(signature, ''), id)))
          filter (where status = 'paid')::int as agents_paid,
        count(distinct lower(coalesce(nullif(payer_address, ''), nullif(signature, ''), id)))
          filter (where status = 'paid' and ${ownerTestSql})::int as agents_paid_owner_test,
        count(distinct lower(coalesce(nullif(payer_address, ''), nullif(signature, ''), id)))
          filter (where status = 'paid' and not (${ownerTestSql}))::int as agents_paid_third_party
      from meter_invoices
    `);
    const row = rows.rows[0];
    assert.ok(row);
    assert.equal(Number(row.invoices_paid), 4);
    assert.equal(Number(row.invoices_paid_owner_test), 2);
    assert.equal(Number(row.invoices_paid_third_party), 2);
    assert.equal(Number(row.usdc_received), 0.75);
    assert.equal(Number(row.usdc_received_owner_test), 0.5);
    assert.equal(Number(row.usdc_received_third_party), 0.25);
    assert.equal(Number(row.agents_paid), 4);
    assert.equal(Number(row.agents_paid_owner_test), 2);
    assert.equal(Number(row.agents_paid_third_party), 2);
    await db.close();
  });
});

describe("sql meter report wiring", () => {
  it("splits paid cohorts in the raw SQL report without changing the unfiltered totals", () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sql-store.ts"), "utf8");
    assert.match(sql, /ownerTestInvoiceMatchSql\(\)/);
    assert.match(sql, /count\(\*\) filter \(where status = 'paid'\)::int as invoices_paid/);
    assert.match(sql, /as invoices_paid_owner_test/);
    assert.match(sql, /as invoices_paid_third_party/);
    assert.match(sql, /as usdc_received,/);
    assert.match(sql, /as usdc_received_owner_test/);
    assert.match(sql, /as usdc_received_third_party/);
    assert.match(sql, /as agents_paid,/);
    assert.match(sql, /as agents_paid_owner_test/);
    assert.match(sql, /as agents_paid_third_party/);
  });
});
