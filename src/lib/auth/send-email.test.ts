import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  newSubscriberNotifySubject,
  newSubscriberNotifyText,
  warningAlertEmailCopy,
  warningAlertEmailText,
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

describe("warning alert email copy", () => {
  it("uses the sketched subjects and CTAs", () => {
    const hold = warningAlertEmailCopy({
      kind: "hold",
      agentName: "Treasury Bot",
      message: "First-time destination — waiting for you.",
    });
    assert.equal(hold.subject, "Agent Control: hold needs a look");
    assert.equal(hold.ctaPath, "/inbox");
    assert.match(hold.bodyLines.join("\n"), /Treasury Bot/);
    assert.match(hold.bodyLines.join("\n"), /First-time destination/);

    const near = warningAlertEmailCopy({
      kind: "near_limit",
      agentName: "Treasury Bot",
      message: "Treasury Bot is at 82% of its daily cap.",
    });
    assert.equal(near.subject, "Agent Control: near daily limit");
    assert.equal(near.ctaPath, "/alerts");

    const alert = warningAlertEmailCopy({
      kind: "alert",
      agentName: "Treasury Bot",
      message: "Amount is at or above the alert threshold of $400.",
    });
    assert.equal(alert.subject, "Agent Control: policy alert");
    assert.equal(alert.ctaPath, "/alerts");

    const block = warningAlertEmailCopy({
      kind: "block",
      agentName: "Treasury Bot",
      message: "Destination is on the denylist.",
    });
    assert.equal(block.subject, "Agent Control: spend blocked");
    assert.equal(block.ctaPath, "/alerts");
  });

  it("plain text includes the CTA URL", () => {
    const text = warningAlertEmailText({
      title: "A spend is waiting for you",
      bodyLines: ["Treasury Bot has a hold in Approval Inbox."],
      ctaUrl: "https://agent-control.net/inbox",
      ctaLabel: "Open Approval Inbox",
    });
    assert.match(text, /A spend is waiting for you/);
    assert.match(text, /https:\/\/agent-control\.net\/inbox/);
    assert.doesNotMatch(text, /Slack/i);
  });
});
