import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateEntitlement } from "./plans.ts";
import {
  CHECKOUT_USAGE,
  CheckoutNotConfiguredError,
  HUMAN_PRINCIPAL_LINE,
  STOREFRONT_NO_AGENT_ROOT,
  STOREFRONT_NO_INBOX_DECIDE,
  STOREFRONT_NO_VIRTUAL_CARD,
  checkoutPayUrl,
  decideTrialOrAttach,
  getPricing,
  isReusableOpenPayRequest,
  listPaidPlans,
  parseCheckoutBody,
  parseHumanEmail,
  parsePrincipalId,
  parseTrialBody,
  principalUserIdFromAgent,
  refuseAgentInboxApprove,
  runCreateCheckout,
  runGetStatus,
  runStartTrialOrAttach,
  statusFromEntitlement,
  storefrontInviteCopy,
  toCheckoutResponse,
  type CheckoutPayRequest,
  type CreateCheckoutDeps,
  type StorefrontAgent,
  type StorefrontPrincipal,
  type TrialDeps,
} from "./storefront.ts";

const HUMAN = "user_principal_1";
const AGENT = "agent_row_1";
const KEY = "ag_test_storefront";
const EMAIL = "ops@example.com";

function futureExpiry(minutes = 20) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function pastExpiry() {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

function principal(overrides: Partial<StorefrontPrincipal> = {}): StorefrontPrincipal {
  return {
    userId: HUMAN,
    email: EMAIL,
    entitlement: evaluateEntitlement({
      plan: "free",
      status: "trialing",
      trial_ends_at: futureExpiry(60 * 24),
      period_ends_at: null,
    }),
    ...overrides,
  };
}

function agent(overrides: Partial<StorefrontAgent> = {}): StorefrontAgent {
  return { id: AGENT, userId: HUMAN, ...overrides };
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

function memoryCheckout(seed?: {
  agents?: Record<string, StorefrontAgent>;
  rows?: CheckoutPayRequest[];
  createError?: Error;
}): CreateCheckoutDeps & { createdUserIds: string[]; createCalls: number } {
  const rows = [...(seed?.rows ?? [])];
  const createdUserIds: string[] = [];
  const deps: CreateCheckoutDeps & { createdUserIds: string[]; createCalls: number } = {
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

describe("getPricing", () => {
  it("lists Starter / Pro / Team and 1-day trial truth", () => {
    const pricing = getPricing();
    assert.equal(pricing.product, "Agent Control");
    assert.equal(pricing.tagline, "External audit for your agents");
    assert.equal(pricing.human_principal, HUMAN_PRINCIPAL_LINE);
    assert.equal(pricing.trial.days, 1);
    assert.equal(pricing.trial.hours, 24);
    assert.equal(pricing.trial.card, false);
    assert.equal(pricing.trial.kyc, false);
    assert.deepEqual(
      listPaidPlans().map((p) => [p.id, p.price_usd]),
      [
        ["starter", 29],
        ["pro", 49],
        ["team", 149],
      ],
    );
    assert.equal(pricing.pay.asset, "USDC");
    assert.equal(pricing.pay.chain, "solana");
    assert.equal(pricing.pay.no_virtual_card, true);
    assert.equal(pricing.storefront.checkout, "POST /api/v1/billing/checkout");
    assert.ok(pricing.storefront.mcp_tools.includes("get_pricing"));
    assert.ok(pricing.storefront.mcp_tools.includes("create_checkout"));
    assert.doesNotMatch(JSON.stringify(pricing), /\bbroadcast/i);
    assert.doesNotMatch(JSON.stringify(pricing), /virtual card/i);
  });
});

describe("parseHumanEmail / parsePrincipalId", () => {
  it("accepts a normal email and rejects junk", () => {
    assert.equal(parseHumanEmail("Ops@Example.com"), "ops@example.com");
    assert.equal(parseHumanEmail("  a@b.co  "), "a@b.co");
    assert.equal(parseHumanEmail(""), null);
    assert.equal(parseHumanEmail("not-an-email"), null);
    assert.equal(parseHumanEmail("ag_only_key"), null);
    assert.equal(parseHumanEmail(12), null);
  });

  it("accepts a principal id and rejects emails as ids", () => {
    assert.equal(parsePrincipalId("user_principal_1"), "user_principal_1");
    assert.equal(parsePrincipalId("ops@example.com"), null);
    assert.equal(parsePrincipalId("  "), null);
  });
});

describe("trial and attach — human principal only", () => {
  it("invites a human when no account exists — never creates an agent root", () => {
    const decided = decideTrialOrAttach({
      email: EMAIL,
      principalId: null,
      agent: null,
      principal: null,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.result.action, "invite_human");
    if (decided.result.action !== "invite_human") return;
    assert.equal(decided.result.signup_url, "https://agent-control.net/signup");
    assert.match(decided.result.note, /cannot open a root account/);
    assert.equal(decided.result.human_principal, HUMAN_PRINCIPAL_LINE);
  });

  it("returns existing principal status without opening a second account", () => {
    const decided = decideTrialOrAttach({
      email: EMAIL,
      principalId: null,
      agent: null,
      principal: principal(),
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.result.action, "existing_principal");
    if (decided.result.action !== "existing_principal") return;
    assert.equal(decided.result.status.human_principal.owns_billing, true);
    assert.equal(decided.result.status.human_principal.owns_inbox, true);
    assert.equal(decided.result.status.plan, "free");
    assert.equal(decided.result.status.status, "trialing");
  });

  it("attaches when the agent key already belongs to that human", () => {
    const decided = decideTrialOrAttach({
      email: EMAIL,
      principalId: null,
      agent: agent(),
      principal: principal(),
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.result.action, "attached");
  });

  it("refuses to move an agent onto a different human", () => {
    const decided = decideTrialOrAttach({
      email: "other@example.com",
      principalId: null,
      agent: agent(),
      principal: principal(),
    });
    assert.equal(decided.ok, false);
    if (decided.ok) return;
    assert.equal(decided.status, 409);
    assert.match(decided.error, /cannot change the customer of record/);
  });

  it("refuses a principal_id that is not this agent's owner", () => {
    const decided = decideTrialOrAttach({
      email: null,
      principalId: "someone_else",
      agent: agent(),
      principal: principal(),
    });
    assert.equal(decided.ok, false);
    if (decided.ok) return;
    assert.equal(decided.status, 409);
  });

  it("requires a human email or principal — no agent-only signup", () => {
    const parsed = parseTrialBody({});
    assert.match(parsed.error ?? "", /human_email or principal_id/);
    const decided = decideTrialOrAttach({
      email: null,
      principalId: null,
      agent: null,
      principal: null,
    });
    assert.equal(decided.ok, false);
    if (decided.ok) return;
    assert.equal(decided.error, STOREFRONT_NO_AGENT_ROOT);
  });
});

describe("runStartTrialOrAttach with mocks", () => {
  it("looks up by email when no API key is given", async () => {
    const deps: TrialDeps = {
      lookupAgentByApiKey: async () => {
        throw new Error("should not look up an agent without a key");
      },
      lookupPrincipalByEmail: async (email) => (email === EMAIL ? principal() : null),
      lookupPrincipalById: async () => null,
    };
    const result = await runStartTrialOrAttach({ apiKey: "", body: { human_email: EMAIL } }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.action, "existing_principal");
  });

  it("returns 401 for an unknown agent key", async () => {
    const deps: TrialDeps = {
      lookupAgentByApiKey: async () => null,
      lookupPrincipalByEmail: async () => null,
      lookupPrincipalById: async () => null,
    };
    const result = await runStartTrialOrAttach(
      { apiKey: "nope", body: { human_email: EMAIL } },
      deps,
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "Unknown API key." });
  });
});

describe("get_status", () => {
  it("returns the principal subscription, not Inbox items", async () => {
    const result = await runGetStatus(KEY, {
      lookupAgentByApiKey: async () => agent(),
      lookupPrincipal: async () => principal(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.result.human_principal.owns_billing, true);
    assert.equal(result.result.human_principal.owns_inbox, true);
    assert.equal(result.result.human_principal.email, EMAIL);
    assert.equal(result.result.pay.checkout, "POST /api/v1/billing/checkout");
    assert.doesNotMatch(JSON.stringify(result.result), /allow once|approval_id|pending_approvals/i);
  });

  it("requires an API key", async () => {
    const result = await runGetStatus("  ", {
      lookupAgentByApiKey: async () => agent(),
      lookupPrincipal: async () => principal(),
    });
    assert.deepEqual(result, { ok: false, status: 401, error: "Missing API key." });
  });
});

describe("create_checkout — agent key pays for the principal", () => {
  it("defaults to Solana USDC and credits agents.user_id, never the agent row", async () => {
    const parsed = parseCheckoutBody({ plan: "starter" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.data, { plan: "starter", asset: "usdc", chain: "solana" });

    const deps = memoryCheckout({ agents: { [KEY]: agent() } });
    const result = await runCreateCheckout({ apiKey: KEY, body: { plan: "pro" } }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(deps.createdUserIds[0], HUMAN);
    assert.notEqual(deps.createdUserIds[0], AGENT);
    assert.equal(principalUserIdFromAgent(agent()), HUMAN);
    assert.match(result.result.pay_url, /\/billing\/pay\?id=pay_new_1/);
    assert.equal(result.result.human_principal.owns_billing, true);
    assert.equal(result.result.human_principal.owns_inbox, true);
    assert.match(result.result.note, /cannot decide Approval Inbox/);
  });

  it("is idempotent on an open unpaid request", async () => {
    const deps = memoryCheckout({
      agents: { [KEY]: agent() },
      rows: [payRow({ id: "pay_existing", status: "underpaid" })],
    });
    const first = await runCreateCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    const second = await runCreateCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.result.pay_request_id, "pay_existing");
    assert.equal(second.result.pay_request_id, "pay_existing");
    assert.equal(deps.createCalls, 0);
  });

  it("returns 401 for missing or unknown keys — no real keys in tests", async () => {
    const deps = memoryCheckout();
    assert.deepEqual(await runCreateCheckout({ apiKey: "  ", body: { plan: "starter" } }, deps), {
      ok: false,
      status: 401,
      error: "Missing API key.",
    });
    assert.deepEqual(await runCreateCheckout({ apiKey: "nope", body: { plan: "starter" } }, deps), {
      ok: false,
      status: 401,
      error: "Unknown API key.",
    });
    assert.equal(deps.createCalls, 0);
  });

  it("rejects free and maps a missing payout to 503", async () => {
    const free = parseCheckoutBody({ plan: "free" });
    assert.equal(free.ok, false);
    const deps = memoryCheckout({
      agents: { [KEY]: agent() },
      createError: new CheckoutNotConfiguredError("Checkout is not configured for Solana."),
    });
    const result = await runCreateCheckout({ apiKey: KEY, body: { plan: "starter" } }, deps);
    assert.deepEqual(result, {
      ok: false,
      status: 503,
      error: "Checkout is not configured for Solana.",
    });
  });

  it("documents the Layer2 checkout path", () => {
    assert.match(CHECKOUT_USAGE.usage, /\/api\/v1\/billing\/checkout/);
    assert.equal(checkoutPayUrl("abc-123"), "https://agent-control.net/billing/pay?id=abc-123");
    const json = toCheckoutResponse(payRow({ id: "pay_9" }));
    assert.equal(json.pay_request_id, "pay_9");
    assert.equal(json.amount_usdc, 29);
  });

  it("does not reuse expired or paid requests", () => {
    const now = Date.now();
    const key = {
      userId: HUMAN,
      plan: "starter" as const,
      asset: "usdc" as const,
      chain: "solana" as const,
    };
    assert.equal(isReusableOpenPayRequest(payRow({ status: "paid" }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ expires_at: pastExpiry() }), key, now), false);
    assert.equal(isReusableOpenPayRequest(payRow({ status: "pending" }), key, now), true);
  });
});

describe("hard rules", () => {
  it("refuses agent self-approve Inbox verbs", () => {
    assert.equal(refuseAgentInboxApprove("allow")?.status, 403);
    assert.equal(refuseAgentInboxApprove("always")?.status, 403);
    assert.equal(refuseAgentInboxApprove("block")?.status, 403);
    assert.equal(refuseAgentInboxApprove("approve")?.error, STOREFRONT_NO_INBOX_DECIDE);
    assert.equal(refuseAgentInboxApprove("start_trial"), null);
    const trial = parseTrialBody({ action: "allow", human_email: EMAIL });
    assert.equal(trial.error, STOREFRONT_NO_INBOX_DECIDE);
    const checkout = parseCheckoutBody({ plan: "starter", decision: "allow" });
    assert.equal(checkout.ok, false);
  });

  it("invite copy has no virtual cards and names the human principal", () => {
    const copy = storefrontInviteCopy(EMAIL);
    assert.match(copy.subject, /start Agent Control/);
    assert.match(copy.text, new RegExp(HUMAN_PRINCIPAL_LINE));
    assert.match(copy.text, /You keep the keys/);
    assert.match(copy.text, /No card/);
    assert.match(copy.text, new RegExp(STOREFRONT_NO_VIRTUAL_CARD));
    assert.doesNotMatch(copy.text, /\bbroadcast/i);
  });

  it("statusFromEntitlement never grants Inbox write to the agent", () => {
    const status = statusFromEntitlement(
      evaluateEntitlement({ plan: "pro", period_ends_at: futureExpiry(60 * 24 * 30) }),
      EMAIL,
    );
    assert.equal(status.human_principal.owns_inbox, true);
    assert.equal(status.plan, "pro");
    assert.equal(status.status, "active");
    assert.match(status.note, /cannot decide Approval Inbox/);
  });
});
