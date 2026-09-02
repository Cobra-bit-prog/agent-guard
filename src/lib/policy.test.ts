import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateTransfer, protectionScore, type PolicyInput } from "./policy.ts";

const policy: PolicyInput = {
  daily_limit_usd: 2000,
  max_tx_amount_usd: 500,
  alert_threshold_usd: 400,
  allowlist: ["0xabc"],
  denylist: ["0xbad"],
  max_hourly_txs: 5,
};

function run(partial: Partial<Parameters<typeof evaluateTransfer>[0]>) {
  return evaluateTransfer({
    valueUsd: 100,
    to: "0xabc",
    usedTodayUsd: 0,
    txsLastHour: 0,
    paused: false,
    policy,
    ...partial,
  });
}

describe("evaluateTransfer hold vs block", () => {
  it("allows an in-policy send to an allowlisted address", () => {
    const v = run({ valueUsd: 100 });
    assert.equal(v.action, "allow");
  });

  it("alerts (and still allows) at the alert threshold", () => {
    const v = run({ valueUsd: 400 });
    assert.equal(v.action, "alert");
  });

  it("holds an unknown destination instead of blocking", () => {
    const v = run({ to: "0xunknown" });
    assert.equal(v.action, "hold");
    assert.match(v.reasons[0] ?? "", /allowlist/i);
  });

  it("holds when over the max transaction size", () => {
    const v = run({ valueUsd: 600 });
    assert.equal(v.action, "hold");
  });

  it("holds when the daily cap would be exceeded", () => {
    const v = run({ valueUsd: 100, usedTodayUsd: 1950 });
    assert.equal(v.action, "hold");
  });

  it("holds at hourly velocity", () => {
    const v = run({ txsLastHour: 5 });
    assert.equal(v.action, "hold");
  });

  it("blocks a paused agent (no hold)", () => {
    const v = run({ paused: true, to: "0xunknown" });
    assert.equal(v.action, "block");
  });

  it("blocks a denylisted destination (no hold)", () => {
    const v = run({ to: "0xbad" });
    assert.equal(v.action, "block");
  });

  it("keeps hold when amount also crosses the alert threshold", () => {
    const v = run({ valueUsd: 600 });
    assert.equal(v.action, "hold");
    assert.ok(v.reasons.some((r) => /alert threshold/i.test(r)));
  });

  it("does not hold at the policy layer when the allowlist is empty", () => {
    const v = run({
      to: "0xunknown",
      policy: { ...policy, allowlist: [] },
    });
    assert.equal(v.action, "allow");
  });
});

describe("protectionScore trial copy", () => {
  it("describes a 1-day trial, not a 3-day trial", () => {
    const s = protectionScore({
      agentCount: 1,
      allowlisted: 1,
      tightTxCap: 1,
      openCritical: 0,
      paid: false,
      expired: false,
    });
    assert.ok(s.notes.some((n) => /1-day trial/i.test(n)));
    assert.equal(
      s.notes.some((n) => /3-day/i.test(n)),
      false,
    );
  });
});
