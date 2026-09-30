import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMeterRequest } from "./http.ts";
import { handleShop } from "./shop.ts";
import { createMeterStore } from "./store.ts";

const ORIGIN = "https://agent-control.net";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("live shop requires ticket", () => {
  it("refuses with 402 stamp $0.05 when no ticket", async () => {
    const store = createMeterStore();
    const res = await handleShop(new Request(`${ORIGIN}/api/v1/shop`), store);
    assert.equal(res.status, 402);
    const body = (await res.json()) as { sku: string; gate: string; price_usd?: number };
    assert.equal(body.sku, "stamp_tx");
    assert.equal(body.gate, "shop");
  });

  it("opens when a real allow ticket is present", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "stamp_tx", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const stamp = await handleMeterRequest(
      post("/api/v1/meter/stamp", { decision: "allow", chain: "solana", to: "Shop" }, { "X-Agent-Pass": pass.token }),
      "/api/v1/meter/stamp",
      store,
    );
    const ticket = (await stamp.json()) as { stamp_id: string };
    const res = await handleShop(
      new Request(`${ORIGIN}/api/v1/shop`, { headers: { "X-Stamp-Id": ticket.stamp_id } }),
      store,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; hosts: string[] };
    assert.equal(body.ok, true);
    assert.ok(body.hosts.length > 0);
  });
});
