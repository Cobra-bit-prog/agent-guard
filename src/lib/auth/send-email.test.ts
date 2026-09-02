import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  newSubscriberNotifySubject,
  newSubscriberNotifyText,
} from "./send-email.server.ts";

describe("new subscriber admin notify", () => {
  it("uses a Free trial subject for trial start", () => {
    assert.equal(
      newSubscriberNotifySubject({ kind: "trial", planName: "Free" }),
      "New subscriber — Free trial",
    );
  });

  it("uses Paid plus plan name for paid confirm", () => {
    assert.equal(
      newSubscriberNotifySubject({ kind: "paid", planName: "Starter" }),
      "New subscriber — Paid Starter",
    );
    assert.equal(
      newSubscriberNotifySubject({ kind: "paid", planName: "Pro" }),
      "New subscriber — Paid Pro",
    );
  });

  it("body distinguishes trial start from paid confirm and includes plan + timestamp", () => {
    const at = "2026-09-02T12:00:00.000Z";
    const trial = newSubscriberNotifyText({
      kind: "trial",
      planName: "Free",
      at,
      userEmail: "ops@example.com",
    });
    assert.match(trial, /Free trial start/);
    assert.match(trial, /Plan: Free/);
    assert.match(trial, /When: 2026-09-02T12:00:00.000Z/);
    assert.match(trial, /User: ops@example.com/);
    assert.doesNotMatch(trial, /Paid confirmation/);

    const paid = newSubscriberNotifyText({
      kind: "paid",
      planName: "Starter",
      at,
      userEmail: "ops@example.com",
      payRequestId: "pay_1",
      chain: "Solana",
    });
    assert.match(paid, /Paid confirmation/);
    assert.match(paid, /Plan: Starter/);
    assert.match(paid, /When: 2026-09-02T12:00:00.000Z/);
    assert.match(paid, /Pay request: pay_1/);
    assert.match(paid, /Network: Solana/);
    assert.doesNotMatch(paid, /Free trial start/);
  });
});
