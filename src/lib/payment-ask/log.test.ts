import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { hashAskIp, logPaymentAsk, paymentAskFor, type PaymentAskQuery } from "./log.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATION = readFileSync(join(ROOT, "migrations/0042_payment_asks.sql"), "utf8");
const PROD = { VERCEL_ENV: "production" };

async function openDb() {
  const db = new PGlite();
  await db.exec(MIGRATION);
  const sql: PaymentAskQuery = { query: (text, params) => db.query(text, params) };
  return { db, sql };
}

function request(
  method = "POST",
  headers: Record<string, string> = {},
  url = "https://agent-control.net/api/v1/meter/scan",
) {
  return new Request(url, { method, headers });
}

function reply(body: unknown, status: number) {
  return Response.json(body, { status });
}

async function rows(db: PGlite) {
  return (await db.query<Record<string, unknown>>("select * from payment_asks order by id")).rows;
}

describe("payment ask log", () => {
  it("logs a 402 with a hashed IP, headers, payer, and sku", async () => {
    const { db, sql } = await openDb();
    const payment = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        payload: {
          authorization: { from: "0xAbC0000000000000000000000000000000000001" },
          signature: "0xsecret",
        },
      }),
    ).toString("base64");
    const req = request("POST", {
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "user-agent": "probe-bot/1.0",
      "x-agent": "my-agent",
      "x-client": "claude-desktop",
      referer: "https://example.com/x",
      "x-payment": payment,
    });
    const res = reply({ error: "payment_required", sku: "look" }, 402);
    const out = await logPaymentAsk(req, res, "/api/v1/meter", async () => sql, { env: PROD });
    assert.equal(out, res);
    const [row] = await rows(db);
    assert.equal(row?.kind, "payment_required");
    assert.equal(row?.route, "/api/v1/meter");
    assert.equal(row?.method, "POST");
    assert.equal(row?.status, 402);
    assert.equal(row?.sku, "look");
    assert.equal(row?.ip_hash, hashAskIp("203.0.113.9"));
    assert.equal(row?.user_agent, "probe-bot/1.0");
    assert.equal(row?.agent, "my-agent");
    assert.equal(row?.client, "claude-desktop");
    assert.equal(row?.referer, "https://example.com/x");
    assert.equal(row?.wallet, "0xAbC0000000000000000000000000000000000001");
    const stored = JSON.stringify(row);
    assert.doesNotMatch(stored, /203\.0\.113\.9/);
    assert.doesNotMatch(stored, /0xsecret/);
  });

  it("reads the sku from a nested invoice or plan, and the wallet from the query", async () => {
    const ask = await paymentAskFor(
      request("POST", {}, "https://agent-control.net/api/v1/billing/invoice?wallet=So1anaPayer"),
      reply({ invoice: { plan: "shield_monthly", status: "pending" } }, 200),
      "/api/v1/billing/invoice",
      { createsCheckout: true },
    );
    assert.equal(ask?.kind, "unpaid_checkout");
    assert.equal(ask?.sku, "shield_monthly");
    assert.equal(ask?.wallet, "So1anaPayer");
    assert.equal(ask?.ip_hash, null);
  });

  it("skips 2xx replies on plain routes, paid checkouts, and GETs on checkout routes", async () => {
    const route = "/api/v1/billing/invoice";
    assert.equal(await paymentAskFor(request("POST"), reply({ sku: "look" }, 200), route), null);
    assert.equal(
      await paymentAskFor(request("POST"), reply({ status: "paid", plan: "pro" }, 200), route, {
        createsCheckout: true,
      }),
      null,
    );
    assert.equal(
      await paymentAskFor(request("GET"), reply({ status: "pending" }, 200), route, {
        createsCheckout: true,
      }),
      null,
    );
    assert.equal(
      await paymentAskFor(request("POST"), reply({ error: "bad" }, 400), route, {
        createsCheckout: true,
      }),
      null,
    );
  });

  it("returns the same 402 when the database fails", async () => {
    const res = reply({ error: "payment_required" }, 402);
    const failing = async (): Promise<PaymentAskQuery> => ({
      query: async () => {
        throw new Error("relation payment_asks does not exist");
      },
    });
    const out = await logPaymentAsk(request(), res, "/api/v1/meter", failing, { env: PROD });
    assert.equal(out.status, 402);
    assert.deepEqual(await out.json(), { error: "payment_required" });

    const noDb = async (): Promise<PaymentAskQuery> => {
      throw new Error("no database");
    };
    const again = await logPaymentAsk(request(), reply({}, 402), "/api/v1/meter", noDb, {
      env: PROD,
    });
    assert.equal(again.status, 402);
  });

  it("does not wait on a slow database past the cap", async () => {
    const slow = async (): Promise<PaymentAskQuery> => ({
      query: () => new Promise((resolve) => setTimeout(resolve, 2000).unref()),
    });
    const started = Date.now();
    const out = await logPaymentAsk(request(), reply({}, 402), "/api/v1/meter", slow, {
      env: PROD,
      timeoutMs: 50,
    });
    assert.equal(out.status, 402);
    assert.ok(Date.now() - started < 1000);
  });

  it("writes nothing on preview builds", async () => {
    const { db, sql } = await openDb();
    await logPaymentAsk(request(), reply({}, 402), "/api/v1/meter", async () => sql, {
      env: { VERCEL_ENV: "preview" },
    });
    assert.equal((await rows(db)).length, 0);
  });

  it("clips long header values", async () => {
    const ask = await paymentAskFor(
      request("GET", { "user-agent": "x".repeat(1000) }),
      reply({}, 402),
      "/api/v1/meter",
    );
    assert.equal(ask?.user_agent?.length, 300);
  });
});
