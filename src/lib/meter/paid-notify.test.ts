import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import type { PaidSubscriberNotice } from "../paid-subscriber-notify.ts";
import { OWNER_TEST_INVOICE_IDS } from "./owner-test.ts";
import {
  formatMeterPaidAmount,
  meterPaidPlanName,
  notifyMeterInvoicePaid,
  type MeterPaidNotifier,
} from "./paid-notify.ts";
import { createSqlMeterStore, ensureMeterSchema } from "./sql-store.ts";
import { createMeterStore } from "./store.ts";

const OWNER_A = OWNER_TEST_INVOICE_IDS[0];

function toSql(db: PGlite): Sql {
  const run = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const result = await db.query<T>(text, params);
    return result.rows;
  };
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

function recordingNotifier(sent: PaidSubscriberNotice[]): MeterPaidNotifier {
  return async (invoice, previousStatus) => {
    await notifyMeterInvoicePaid(invoice, previousStatus, async (opts) => {
      sent.push(opts);
    });
  };
}

describe("meter paid notify", () => {
  it("names the sku and formats the amount", () => {
    assert.equal(meterPaidPlanName("looks_20"), "Meter looks_20");
    assert.equal(meterPaidPlanName(" stamp_tx "), "Meter stamp_tx");
    assert.equal(formatMeterPaidAmount(0.2), "0.2 USDC");
    assert.equal(formatMeterPaidAmount(null), undefined);
  });

  it("skips owner-test invoices and already-paid re-fulfills", async () => {
    const sent: PaidSubscriberNotice[] = [];
    const send = async (opts: PaidSubscriberNotice) => {
      sent.push(opts);
    };
    await notifyMeterInvoicePaid(
      {
        invoice_id: OWNER_A,
        sku: "look",
        paid_amount_usd: 0.25,
        paid_at: "2026-09-11T00:00:00.000Z",
        chain: "solana",
      },
      "pending",
      send,
    );
    assert.equal(sent.length, 0);

    await notifyMeterInvoicePaid(
      {
        invoice_id: "inv_real_customer",
        sku: "looks_20",
        amount_usd: 0.2,
        paid_amount_usd: 0.2,
        paid_at: "2026-10-05T00:00:00.000Z",
        chain: "solana",
      },
      "pending",
      send,
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.planName, "Meter looks_20");
    assert.equal(sent[0]?.payRequestId, "inv_real_customer");
    assert.equal(sent[0]?.amount, "0.2 USDC");
    assert.equal(sent[0]?.chain, "Solana");
    assert.equal(sent[0]?.at, "2026-10-05T00:00:00.000Z");

    await notifyMeterInvoicePaid(
      {
        invoice_id: "inv_real_customer",
        sku: "looks_20",
        paid_amount_usd: 0.2,
        paid_at: "2026-10-05T00:00:00.000Z",
        chain: "solana",
      },
      "paid",
      send,
    );
    assert.equal(sent.length, 1);
  });

  it("does not throw when the sender fails", async () => {
    await notifyMeterInvoicePaid(
      {
        invoice_id: "inv_real_customer",
        sku: "stamp_tx",
        paid_amount_usd: 0.05,
        chain: "solana",
      },
      null,
      async () => {
        throw new Error("resend down");
      },
    );
  });

  it("memory fulfill notifies once and skips owner-test and re-fulfill", async () => {
    const sent: PaidSubscriberNotice[] = [];
    const store = createMeterStore({ notifyPaid: recordingNotifier(sent) });
    await store.fulfillInvoice(OWNER_A, { signature: "sig-owner", amountUsdc: 0.25 });
    assert.equal(sent.length, 0);

    const invoice = await store.createInvoice({ sku: "looks_20" });
    const first = await store.fulfillInvoice(invoice.invoice_id, {
      signature: "sig-real",
      amountUsdc: 0.2,
    });
    assert.equal(first.invoice.status, "paid");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.planName, "Meter looks_20");
    assert.equal(sent[0]?.payRequestId, invoice.invoice_id);
    assert.equal(sent[0]?.amount, "0.2 USDC");

    await store.fulfillInvoice(invoice.invoice_id, { signature: "sig-real", amountUsdc: 0.2 });
    assert.equal(sent.length, 1);
  });

  it("sql fulfill notifies once and skips owner-test and re-fulfill", async () => {
    const db = new PGlite();
    const sql = toSql(db);
    await ensureMeterSchema(sql);
    const sent: PaidSubscriberNotice[] = [];
    const store = createSqlMeterStore(sql, { notifyPaid: recordingNotifier(sent) });

    await store.fulfillInvoice(OWNER_A, { signature: "sig-owner", amountUsdc: 0.25 });
    assert.equal(sent.length, 0);

    const invoice = await store.createInvoice({ sku: "stamp_tx" });
    const first = await store.fulfillInvoice(invoice.invoice_id, {
      signature: "sig-stamp",
      amountUsdc: 0.05,
    });
    assert.equal(first.invoice.status, "paid");
    assert.equal(first.pass.sku, "stamp_tx");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.planName, "Meter stamp_tx");
    assert.equal(sent[0]?.payRequestId, invoice.invoice_id);
    assert.equal(sent[0]?.amount, "0.05 USDC");

    await store.fulfillInvoice(invoice.invoice_id, { signature: "sig-stamp", amountUsdc: 0.05 });
    assert.equal(sent.length, 1);
  });
});
