import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_PATH,
  DEFAULT_CHECK_ORIGIN,
  checkBeforePay,
  checkBeforeSend,
  createAgentKitPolicyProvider,
  createCheckClient,
  createX402BeforePaymentHook,
  validateCheckInput,
  valueUsdFromX402Requirements,
  verdictForCheck,
  type CheckResponse,
  type FetchLike,
} from "./index.ts";

function allowBody(over: Partial<CheckResponse> = {}): CheckResponse {
  return {
    decision: "allow",
    reasons: [],
    check_id: "chk_allow",
    agent_id: "agt_1",
    agent: "Bot",
    must_abort: false,
    paused: false,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  handler: (url: string, init?: Parameters<FetchLike>[1]) => Promise<Response>,
): FetchLike {
  return async (input, init) => handler(input, init);
}

describe("verdictForCheck", () => {
  it("maps allow and alert to allow", () => {
    assert.equal(verdictForCheck({ decision: "allow", must_abort: false }), "allow");
    assert.equal(verdictForCheck({ decision: "alert", must_abort: false }), "allow");
  });

  it("maps hold to wait even when must_abort is true", () => {
    assert.equal(verdictForCheck({ decision: "hold", must_abort: true }), "wait");
  });

  it("maps block / must_abort to stop", () => {
    assert.equal(verdictForCheck({ decision: "block", must_abort: true }), "stop");
    assert.equal(verdictForCheck({ decision: "allow", must_abort: true }), "stop");
    assert.equal(verdictForCheck({ decision: "unknown", must_abort: false }), "stop");
  });
});

describe("validateCheckInput", () => {
  it("rejects a missing destination or non-positive USD", () => {
    assert.equal(validateCheckInput({ to: "", value_usd: 10 }), "Provide a destination.");
    assert.equal(
      validateCheckInput({ to: "0xabc", value_usd: 0 }),
      "Provide a value in USD greater than 0.",
    );
  });
});

describe("createCheckClient", () => {
  it("POSTs Bearer key, to, and value_usd and returns allow", async () => {
    let url = "";
    let init: Parameters<FetchLike>[1];
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async (u, i) => {
        url = u;
        init = i;
        return jsonResponse(allowBody());
      }),
    });
    const result = await client.check({ to: "0xabc", value_usd: 25 });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected allow");
    assert.equal(result.verdict, "allow");
    assert.equal(url, `${DEFAULT_CHECK_ORIGIN}${CHECK_PATH}`);
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.Authorization, "Bearer ak_test");
    assert.equal(init?.headers?.["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init?.body ?? "{}"), { to: "0xabc", value_usd: 25 });
  });

  it("returns wait on hold", async () => {
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(
          allowBody({
            decision: "hold",
            must_abort: true,
            reasons: ["First-time destination — waiting for you."],
            poll_url: "/api/v1/approvals/appr_1",
            approval_id: "appr_1",
          }),
        ),
      ),
    });
    const result = await client.check({ to: "0xnew", value_usd: 10 });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected hold");
    assert.equal(result.verdict, "wait");
    assert.equal(result.check.poll_url, "/api/v1/approvals/appr_1");
  });

  it("returns stop on block / must_abort", async () => {
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(
          allowBody({
            decision: "block",
            must_abort: true,
            reasons: ["Paused."],
          }),
        ),
      ),
    });
    const result = await client.check({ to: "0xbad", value_usd: 10 });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected block");
    assert.equal(result.verdict, "stop");
    assert.equal(result.check.must_abort, true);
  });

  it("returns a network error and does not treat it as allow", async () => {
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const result = await client.check({ to: "0xabc", value_usd: 10 });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected network error");
    assert.equal(result.error, "Network error. Do not send.");
  });

  it("does not call fetch when input is invalid", async () => {
    let called = 0;
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async () => {
        called += 1;
        return jsonResponse(allowBody());
      }),
    });
    const result = await client.check({ to: "  ", value_usd: 10 });
    assert.equal(result.ok, false);
    assert.equal(called, 0);
  });

  it("throws when the API key is missing", () => {
    assert.throws(() => createCheckClient({ apiKey: "  " }), /Missing agent API key/);
  });

  it("surfaces HTTP errors from the check API", async () => {
    const client = createCheckClient({
      apiKey: "ak_test",
      fetch: mockFetch(async () => jsonResponse({ error: "Unknown API key." }, 401)),
    });
    const result = await client.check({ to: "0xabc", value_usd: 10 });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected 401");
    assert.equal(result.status, 401);
    assert.equal(result.error, "Unknown API key.");
  });
});

describe("createAgentKitPolicyProvider", () => {
  it("allows an in-policy AgentKit send", async () => {
    const policyProvider = createAgentKitPolicyProvider({
      apiKey: "ak_test",
      fetch: mockFetch(async () => jsonResponse(allowBody())),
    });
    const decision = await policyProvider.evaluate({
      action: "sendUsdc",
      to: "0xabc",
      amount_usdc: "25.00",
    });
    assert.equal(decision.allow, true);
    assert.equal(decision.signals?.verdict, "allow");
  });

  it("does not allow wait (hold) or stop (block)", async () => {
    const hold = createAgentKitPolicyProvider({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(allowBody({ decision: "hold", must_abort: true, reasons: ["Held."] })),
      ),
    });
    const held = await hold.evaluate({ action: "sendUsdc", to: "0xnew", amount_usdc: "5" });
    assert.equal(held.allow, false);
    assert.equal(held.signals?.verdict, "wait");

    const block = createAgentKitPolicyProvider({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(allowBody({ decision: "block", must_abort: true, reasons: ["Paused."] })),
      ),
    });
    const stopped = await block.evaluate({ action: "sendUsdc", to: "0xbad", amount_usdc: "5" });
    assert.equal(stopped.allow, false);
    assert.equal(stopped.signals?.verdict, "stop");
  });

  it("fails closed on network error", async () => {
    const policyProvider = createAgentKitPolicyProvider({
      apiKey: "ak_test",
      fetch: mockFetch(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const decision = await policyProvider.evaluate({
      action: "sendUsdc",
      to: "0xabc",
      amount_usdc: "1",
    });
    assert.equal(decision.allow, false);
    assert.equal(decision.signals?.verdict, "stop");
  });
});

describe("checkBeforeSend", () => {
  it("is the same check without AgentKit types", async () => {
    const result = await checkBeforeSend(
      {
        apiKey: "ak_test",
        fetch: mockFetch(async () => jsonResponse(allowBody())),
      },
      { to: "0xabc", valueUsd: 12 },
    );
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected allow");
    assert.equal(result.verdict, "allow");
  });
});

describe("createX402BeforePaymentHook", () => {
  const req = { payTo: "0xpay", amount: "1000000" }; // $1 USDC (6 decimals)

  it("proceeds on allow", async () => {
    const hook = createX402BeforePaymentHook({
      apiKey: "ak_test",
      fetch: mockFetch(async (_url, init) => {
        assert.deepEqual(JSON.parse(init?.body ?? "{}"), { to: "0xpay", value_usd: 1 });
        return jsonResponse(allowBody());
      }),
    });
    const result = await hook({ selectedRequirements: req });
    assert.equal(result, undefined);
  });

  it("aborts on wait (hold) and stop (block)", async () => {
    const waitHook = createX402BeforePaymentHook({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(allowBody({ decision: "hold", must_abort: true, reasons: ["Held."] })),
      ),
    });
    const wait = await waitHook({ selectedRequirements: req });
    assert.deepEqual(wait, { abort: true, reason: "Held." });

    const stopHook = createX402BeforePaymentHook({
      apiKey: "ak_test",
      fetch: mockFetch(async () =>
        jsonResponse(allowBody({ decision: "block", must_abort: true, reasons: ["Do not send."] })),
      ),
    });
    const stop = await stopHook({ selectedRequirements: req });
    assert.deepEqual(stop, { abort: true, reason: "Do not send." });
  });

  it("aborts on network error", async () => {
    const hook = createX402BeforePaymentHook({
      apiKey: "ak_test",
      fetch: mockFetch(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    const result = await hook({ selectedRequirements: req });
    assert.deepEqual(result, { abort: true, reason: "Network error. Do not send." });
  });

  it("reads v1 maxAmountRequired and extra.value_usd", async () => {
    assert.equal(valueUsdFromX402Requirements({ payTo: "0x", maxAmountRequired: "2500000" }), 2.5);
    assert.equal(
      valueUsdFromX402Requirements({ payTo: "0x", amount: "1", extra: { value_usd: 9.5 } }),
      9.5,
    );
  });
});

describe("checkBeforePay", () => {
  it("checks an x402 requirement before money moves", async () => {
    const result = await checkBeforePay(
      {
        apiKey: "ak_test",
        fetch: mockFetch(async () => jsonResponse(allowBody())),
      },
      { payTo: "0xpay", amount: "500000" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected allow");
    assert.equal(result.verdict, "allow");
  });
});
