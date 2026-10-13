import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWatchHandler, isSolanaReference } from "./watch.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const REF = "11111111111111111111111111111111"; // 32 zero bytes, valid pubkey
const REF2 = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAYOUT = "PAYOUT_TEST";

function setup(opts: { row?: Record<string, unknown> | null; match?: unknown; throws?: boolean } = {}) {
  const calls: unknown[] = [];
  const handler = createWatchHandler({
    json: (data, status = 200) => Response.json(data, { status }),
    getInvoiceRow: async () => (opts.row ?? null) as never,
    isHumanUsdcInvoice: () => true,
    watchUsdcInvoice: async (row) => row,
    invoiceView: (row) => ({ view: true, ...(row as object) }),
    origin: () => "https://agent-control.net",
    findMatchingUsdcPayment: async (args) => {
      calls.push(args);
      if (opts.throws) throw new Error("rpc down");
      return (opts.match ?? { kind: "none" }) as never;
    },
    payoutAddress: () => PAYOUT,
  });
  const hit = (qs: string) => handler({ request: new Request(`https://agent-control.net/api/v1/billing/watch?${qs}`) });
  return { hit, calls };
}

describe("isSolanaReference", () => {
  it("accepts 32-byte base58 pubkeys", () => {
    assert.equal(isSolanaReference(REF), true);
    assert.equal(isSolanaReference(REF2), true);
  });
  it("rejects junk", () => {
    for (const v of ["inv_TEST", "", "abc", "0OIl" + REF.slice(4), REF2 + "x", "1".repeat(45), undefined, 5]) {
      assert.equal(isSolanaReference(v), false, String(v));
    }
  });
});

describe("billing watch handler", () => {
  it("404s unknown invoice ids without touching the chain", async () => {
    const t = setup();
    for (const qs of ["id=inv_TEST", "reference=inv_TEST", "id=inv_TEST&reference=junk"]) {
      const res = await t.hit(qs);
      assert.equal(res.status, 404, qs);
      assert.deepEqual(await res.json(), { error: "Invoice not found." });
    }
    assert.equal(t.calls.length, 0);
  });

  it("400s with no id or reference", async () => {
    assert.equal((await setup().hit("")).status, 400);
  });

  it("falls back on-chain for a valid row-less reference (pending)", async () => {
    const t = setup({ match: { kind: "none" } });
    const res = await t.hit(`reference=${REF2}&plan=action`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "pending", signature: null, recipient: PAYOUT });
    assert.deepEqual(t.calls, [{ reference: REF2, recipient: PAYOUT, amountUsdc: 49 }]);
  });

  it("reports paid for a valid reference with a matching payment", async () => {
    const t = setup({ match: { kind: "paid", signature: "sig1" } });
    const res = await t.hit(`reference=${REF}`);
    assert.deepEqual(await res.json(), { status: "paid", signature: "sig1", recipient: PAYOUT });
  });

  it("keeps pending when the RPC fails", async () => {
    const res = await setup({ throws: true }).hit(`reference=${REF}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "pending", signature: null, recipient: PAYOUT });
  });

  it("returns the invoice view when a row exists", async () => {
    const t = setup({ row: { id: "inv_1", asset: "usdc", chain: "solana" } });
    const res = await t.hit("id=inv_1");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).view, true);
    assert.equal(t.calls.length, 0);
  });

  it("route wires the shared handler", () => {
    const route = readFileSync(join(ROOT, "src/routes/api/v1/billing.watch.ts"), "utf8");
    assert.match(route, /createWatchHandler\(/);
    assert.match(route, /findMatchingUsdcPayment,/);
  });
});
