import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handleMeterRequest } from "./http.ts";
import { createMeterStore } from "./store.ts";
import {
  getSlip,
  issueMissSlip,
  linkShop,
  publishName,
  resetMapForTests,
  resolveName,
  sameShop,
  startWatch,
  tickWatch,
} from "./map.ts";

const ORIGIN = "https://agent-control.net";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers });
}

beforeEach(() => resetMapForTests());

describe("agent map", () => {
  it("resolves a published name", () => {
    publishName({ name: "acme.pay", chain: "base", address: "0x1111111111111111111111111111111111111111" });
    const hit = resolveName("Acme.Pay");
    assert.equal("address" in hit && hit.address, "0x1111111111111111111111111111111111111111");
  });

  it("same shop after link", () => {
    linkShop(["aa", "bb"], "shop_x");
    const hit = sameShop("aa", "BB");
    assert.equal("same" in hit && hit.same, true);
  });

  it("watch fires on move", () => {
    const w = startWatch({ address: "old" });
    assert.equal("watch_id" in w, true);
    if (!("watch_id" in w)) return;
    const tick = tickWatch(w.watch_id, { address: "new", live: true });
    assert.equal("changed" in tick && tick.changed, true);
  });

  it("miss slip only when paid and empty", () => {
    const miss = issueMissSlip({
      paid: true,
      url: "https://s.example",
      pay_to: "0x1",
      amount_usd: 0.02,
      status: 502,
      body_empty: true,
    });
    assert.equal("slip_id" in miss, true);
    if (!("slip_id" in miss)) return;
    assert.equal("slip_id" in getSlip(miss.slip_id), true);
    const good = issueMissSlip({
      paid: true,
      url: "https://s.example",
      pay_to: "0x1",
      amount_usd: 0.02,
      status: 200,
      body: { ok: true },
      body_empty: false,
    });
    assert.match(String((good as { error?: string }).error), /delivered/);
  });

  it("HTTP: publish is free, resolve unpaid is 402 $0.01", async () => {
    process.env.NODE_ENV = "test";
    const store = createMeterStore();
    const pub = await handleMeterRequest(
      post("/api/v1/meter/name", { name: "otto.pay", chain: "solana", address: "Addr1" }),
      "/api/v1/meter/name",
      store,
    );
    assert.equal(pub.status, 200);
    const unpaid = await handleMeterRequest(get("/api/v1/meter/resolve/otto.pay"), "/api/v1/meter/resolve/otto.pay", store);
    assert.equal(unpaid.status, 402);
    const body = (await unpaid.json()) as { sku: string; amount_usd: number };
    assert.equal(body.sku, "resolve");
    assert.equal(body.amount_usd, 0.01);

    const issued = await handleMeterRequest(
      post("/api/v1/meter/pass", { sku: "resolve", proof: { type: "dev" } }),
      "/api/v1/meter/pass",
      store,
    );
    const pass = (await issued.json()) as { token: string };
    const paid = await handleMeterRequest(
      get("/api/v1/meter/resolve/otto.pay", { "x-agent-pass": pass.token }),
      "/api/v1/meter/resolve/otto.pay",
      store,
    );
    assert.equal(paid.status, 200);
    const resolved = (await paid.json()) as { address: string; question: string };
    assert.equal(resolved.address, "Addr1");
    assert.equal(resolved.question, "Where do I send it now?");
  });
});
