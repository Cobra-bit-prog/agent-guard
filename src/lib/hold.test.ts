import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HOLD_TTL_MS, pollDecisionFromStatus, shouldHoldFirstTimeDestination } from "./hold.ts";
import { FREE_TRIAL_DAYS, FREE_TRIAL_HOURS } from "./plans.ts";

describe("hold TTL and trial duration", () => {
  it("holds expire after 10 minutes", () => {
    assert.equal(HOLD_TTL_MS, 10 * 60 * 1000);
  });

  it("trial is 1 day / 24 hours, not 3 days", () => {
    assert.equal(FREE_TRIAL_DAYS, 1);
    assert.equal(FREE_TRIAL_HOURS, 24);
  });
});

describe("shouldHoldFirstTimeDestination", () => {
  it("holds an in-policy first-time destination", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "allow",
        dest: "0xunknown",
        allowlist: ["0xabc"],
        seenSuccessDestinations: [],
      }),
      true,
    );
  });

  it("holds an alert-level first-time destination", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "alert",
        dest: "0xnew",
        allowlist: [],
        seenSuccessDestinations: [],
      }),
      true,
    );
  });

  it("does not hold an allowlisted destination", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "allow",
        dest: "0xAbC",
        allowlist: ["0xabc"],
        seenSuccessDestinations: [],
      }),
      false,
    );
  });

  it("does not hold a destination already seen on a real successful send", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "allow",
        dest: "0xseen",
        allowlist: [],
        seenSuccessDestinations: ["0xSEEN"],
      }),
      false,
    );
  });

  it("treats Allow-once (presign success omitted from seen) as still first-time", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "allow",
        dest: "0xonce",
        allowlist: [],
        seenSuccessDestinations: [],
      }),
      true,
    );
  });

  it("does not override block or an existing hold", () => {
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "block",
        dest: "0xunknown",
        allowlist: [],
        seenSuccessDestinations: [],
      }),
      false,
    );
    assert.equal(
      shouldHoldFirstTimeDestination({
        action: "hold",
        dest: "0xunknown",
        allowlist: [],
        seenSuccessDestinations: [],
      }),
      false,
    );
  });
});

describe("pollDecisionFromStatus", () => {
  it("maps allow and always to allow (agent may sign)", () => {
    assert.equal(pollDecisionFromStatus("allow"), "allow");
    assert.equal(pollDecisionFromStatus("always"), "allow");
  });

  it("keeps hold while waiting", () => {
    assert.equal(pollDecisionFromStatus("hold"), "hold");
  });

  it("maps block and expired to block (must_abort)", () => {
    assert.equal(pollDecisionFromStatus("block"), "block");
    assert.equal(pollDecisionFromStatus("expired"), "block");
  });
});
