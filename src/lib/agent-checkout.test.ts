import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CheckoutNotConfiguredError,
  checkoutPayUrl,
  isReusableOpenPayRequest,
  parseCheckoutBody,
  principalUserIdFromAgent,
  runAgentCheckout,
  toCheckoutResponse,
  type AgentCheckoutDeps,
  type CheckoutPayRequest,
} from "./agent-checkout.ts";

const HUMAN = "user_principal_1";
const AGENT = "agent_row_1";
const KEY = "ag_live_test_key";

function futureExpiry(minutes = 20) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function pastExpiry() {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

function payRow(overrides: Partial<CheckoutPayRequest> = {}): CheckoutPayRequest {
  return {
    id: "pay_open_1",
    user_id: HUMAN,
    plan: "starter",
    asset: "usdc",
    chain: "solana",
    amount_usdc: 29,
    amount_base_units: "29000000",
    recipient: "Payout1111111111111111111111111111111111111",
    reference: "ref_open_1",
    expires_at: futureExpiry(),
    status: "pending",
    ...overrides,
  };
}

function memoryDeps(seed?: {
  agents?: Record<string, { id: string; user_id: string }>;
  rows?: CheckoutPayRequest[];
  createError?: Error;
}): AgentCheckoutDeps & { createdUserIds: string[]; createCalls: number } {
  const rows = [...(seed?.rows ?? [])];
  const createdUserIds: string[] = [];
  const deps: AgentCheckoutDeps & { createdUserIds: string[]; createCalls: number } = {
    createdUserIds,
    createCalls: 0,
    lookupAgentByApiKey: async (apiKey) => seed?.agents?.[apiKey] ?? null,
    findOpenPayRequest: async (key) =>
      rows.find((row) => isReusableOpenPayRequest(row, key)) ?? null,
    createPayRequest: async (userId, input) => {
      deps.createCalls += 1;
      createdUserIds.push(userId);
      if (seed?.createError) throw seed.createError;
      const row = payRow({
        id: `pay_new_${deps.createCalls}`,
        user_id: userId,
        plan: input.plan,
        asset: input.asset,
        chain: input.chain,
        reference: `ref_new_${deps.createCalls}`,
      });
      rows.push(row);
      return row;
    },
  };
  return deps;
}

describe("parseCheckoutBody", () => {
  it("defaults asset to usdc and chain to solana", () => {
    const parsed = parseCheckoutBody({ plan: "starter" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data, { plan: "starter", asset: "usdc", chain: "solana" });
  });

  it("rejects missing or unknown plans", () => {
    assert.equal(parseCheckoutBody({}).ok, false);
    const free = parseCheckoutBody({ plan: "free" });
    assert.equal(free.ok, false);
    if (free.ok) return;
    assert.equal(free.status, 400);
    assert.match(free.error, /starter, pro, or team/);
  });

  it("rejects a bad asset", () => {
    const bad = parseCheckoutBody({ plan: "pro", asset: "btc" });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal(bad.status, 400);
    assert.match(bad.error, /asset or chain/);
  });
});

describe("principal ownership", () => {
  it("uses agents.user_id, never the agent row id", () => {
    assert.equal(principalUserIdFromAgent({ id: AGENT, user_id: HUMAN }), HUMAN);
    assert.notEqual(principalUserIdFromAgent({ id: AGENT, user_id: HUMAN }), AGENT);
  });

  it("stores pay_requests.user_id as the human principal", async () => {
    const deps = memoryDeps({
      agents: { [KEY]: { id: AGENT, user_id: HUMAN } },
    });
    const result = await runAgentCheckout({ apiKey: KEY, body: { plan: "pro" } }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(deps.createdUserIds[0], HUMAN);
    assert.notEqual(deps.createdUserIds[0], AGENT);
    assert.equal(result.result.plan, "pro");
    assert.match(result.result.pay_url, /\/billing\/pay\?id=pay_new_1/);
  });
});

describe("auth failure", () => {
  it("returns 401 for a missing API key", async () => {
    const deps = memoryDeps();
    const result = await runAgentCheckout({ apiKey: "  ", body: { plan: "starter" } }, deps);
    assert.deepEqual(result, { ok: false, status: 401, error: "Missing API key." });
    assert.equal(deps.createCalls, 0);
  });

  it("returns 401 for an unknown API key", async () => {
    const deps = memoryDeps({ agents: {} });
    const result = await runAgentCheckout({ apiKey: "nope", body: { plan: "starter" } }, deps);
    assert.deepEqual(result, { ok: false, status: 401, error: "Unknown API key." });
    assert.equal(deps.createCalls, 0);
  });
});

describe("idempotency", () => {
  it("returns an open unpaid request for the same user+plan+asset+chain", async () => {
    const existing = payRow({ id: "pay_existing", status: "underpaid" });
    const deps = memoryDeps({
      agents: { [KEY]: { id: AGENT, user_id: HUMAN } },
      rows: [existing],
    });
    const first = await runAgentCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    const second = await runAgentCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.result.pay_request_id, "pay_existing");
    assert.equal(second.result.pay_request_id, "pay_existing");
    assert.equal(deps.createCalls, 0);
  });

  it("creates a new request when the plan differs", async () => {
    const deps = memoryDeps({
      agents: { [KEY]: { id: AGENT, user_id: HUMAN } },
      rows: [payRow({ plan: "starter" })],
    });
    const result = await runAgentCheckout({ apiKey: KEY, body: { plan: "team" } }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.plan, "team");
    assert.equal(result.result.pay_request_id, "pay_new_1");
    assert.equal(deps.createCalls, 1);
    assert.equal(deps.createdUserIds[0], HUMAN);
  });

  it("creates a new request when the open one is expired, paid, or a different plan", () => {
    const now = Date.now();
    const key = {
      userId: HUMAN,
      plan: "starter" as const,
      asset: "usdc" as const,
      chain: "solana" as const,
    };
    assert.equal(isReusableOpenPayRequest(payRow({ status: "expired" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ status: "paid" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ expires_at: pastExpiry() }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ plan: "team" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ user_id: "other_human" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ asset: "sol" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ status: "pending" }), key, now), true);
  });
});

describe("checkout response and errors", () => {
  it("builds the human pay page URL with the id query param", () => {
    assert.equal(checkoutPayUrl("abc-123"), "https://agent-control.net/billing/pay?id=abc-123");
    const json = toCheckoutResponse(payRow({ id: "pay_9" }));
    assert.equal(json.pay_request_id, "pay_9");
    assert.equal(json.pay_url, "https://agent-control.net/billing/pay?id=pay_9");
    assert.equal(json.amount_usdc, 29);
    assert.equal(json.amount_base_units, "29000000");
  });

  it("maps a missing payout address to 503", async () => {
    const deps = memoryDeps({
      agents: { [KEY]: { id: AGENT, user_id: HUMAN } },
      createError: new CheckoutNotConfiguredError("Checkout is not configured for Solana."),
    });
    const result = await runAgentCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: "Checkout is not configured for Solana.",
    });
  });
});
