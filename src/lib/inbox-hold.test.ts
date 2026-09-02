import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOLD_TIMEOUT_IS_BLOCK,
  INBOX_HOLD_QUERY,
  formatHoldAmountDest,
  holdNoticeMessage,
  holdNoticeToken,
  inboxHoldEmailCopy,
  inboxHoldPath,
  inboxHoldTelegramText,
  inboxHoldUrl,
  inboxHoldWebhookPayload,
  isHttpsWebhookUrl,
  postSlackIncomingWebhook,
  webhookLogChannel,
} from "./inbox-hold.ts";
import { warningNoticeToken } from "./warning-alert.ts";

describe("inbox hold deep link", () => {
  it("uses ?hold=<approvalId> and the production origin", () => {
    assert.equal(INBOX_HOLD_QUERY, "hold");
    assert.equal(inboxHoldPath(null), "/inbox");
    assert.equal(inboxHoldPath("  "), "/inbox");
    assert.equal(inboxHoldPath("appr_123"), "/inbox?hold=appr_123");
    assert.equal(
      inboxHoldUrl("appr_123"),
      "https://agent-control.net/inbox?hold=appr_123",
    );
  });

  it("encodes the approval id in the query", () => {
    assert.equal(inboxHoldPath("a b"), "/inbox?hold=a%20b");
  });
});

describe("hold notify copy", () => {
  it("says timeout is a block and includes amount/dest when present", () => {
    const copy = inboxHoldEmailCopy({
      agentName: "Treasury Bot",
      message: "First-time destination — waiting for you.",
      approvalId: "appr_123",
      valueUsd: 2400,
      to: "0x1234567890abcdef1234567890abcdef12345678",
    });
    const body = copy.bodyLines.join("\n");
    assert.equal(copy.subject, "Agent Control: hold needs a look");
    assert.equal(copy.ctaPath, "/inbox?hold=appr_123");
    assert.match(body, /Treasury Bot/);
    assert.match(body, /First-time destination/);
    assert.match(body, /\$2,400/);
    assert.ok(body.includes(HOLD_TIMEOUT_IS_BLOCK));
    assert.match(body, /must abort \(treated as a block\)/);
    assert.match(body, /10 minutes/);
  });

  it("still states timeout = block without amount or dest", () => {
    const copy = inboxHoldEmailCopy({ agentName: "Router" });
    assert.match(copy.bodyLines.join("\n"), /treated as a block/);
    assert.equal(copy.ctaPath, "/inbox");
  });
});

describe("hold webhook payload", () => {
  it("is Slack incoming-webhook JSON with text, blocks, and the deep link", () => {
    const ctaUrl = inboxHoldUrl("appr_9");
    const payload = inboxHoldWebhookPayload({
      agentName: "Treasury Bot",
      approvalId: "appr_9",
      valueUsd: 850,
      to: "7GdKxyzLr9eabc",
      ctaUrl,
    });
    assert.equal(typeof payload.text, "string");
    assert.match(payload.text, /treated as a block/);
    assert.match(payload.text, /https:\/\/agent-control\.net\/inbox\?hold=appr_9/);
    assert.ok(Array.isArray(payload.blocks));
    assert.equal(payload.blocks[0]?.type, "section");
    const actions = payload.blocks[1];
    assert.equal(actions?.type, "actions");
    if (actions?.type !== "actions") throw new Error("expected actions block");
    assert.equal(actions.elements[0]?.url, ctaUrl);
    assert.equal(actions.elements[0]?.text.text, "Open Approval Inbox");
    assert.doesNotMatch(JSON.stringify(payload), /broadcast/i);
  });

  it("accepts https webhook URLs and labels Slack hosts as slack", () => {
    assert.equal(isHttpsWebhookUrl("https://hooks.slack.com/services/T/B/X"), true);
    assert.equal(isHttpsWebhookUrl("http://hooks.slack.com/services/T/B/X"), false);
    assert.equal(isHttpsWebhookUrl("not-a-url"), false);
    assert.equal(isHttpsWebhookUrl(""), false);
    assert.equal(
      webhookLogChannel("https://hooks.slack.com/services/T/B/X"),
      "slack",
    );
    assert.equal(webhookLogChannel("https://example.com/hooks/agent"), "webhook");
  });
});

describe("hold dedup token", () => {
  it("is per approval id so a new hold still notifies inside the 45-minute window", () => {
    const agentId = "agent-1";
    const first = "appr_aaa";
    const second = "appr_bbb";
    assert.equal(holdNoticeToken(first), "[hold:appr_aaa]");
    assert.notEqual(holdNoticeToken(first), holdNoticeToken(second));
    assert.notEqual(holdNoticeToken(first), warningNoticeToken("hold", agentId));
    assert.match(holdNoticeMessage(first, "waiting"), /^\[hold:appr_aaa\] waiting$/);
  });
});

describe("telegram hold text", () => {
  it("includes the timeout = block sentence and deep link", () => {
    const text = inboxHoldTelegramText({
      agentName: "Treasury Bot",
      approvalId: "appr_1",
      ctaUrl: inboxHoldUrl("appr_1"),
    });
    assert.match(text, /treated as a block/);
    assert.match(text, /https:\/\/agent-control\.net\/inbox\?hold=appr_1/);
  });
});

describe("formatHoldAmountDest", () => {
  it("returns null when nothing is known", () => {
    assert.equal(formatHoldAmountDest({}), null);
  });
});

describe("postSlackIncomingWebhook", () => {
  it("POSTs JSON to an https URL and skips invalid URLs", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: String(init?.body ?? ""),
      });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      const payload = inboxHoldWebhookPayload({
        agentName: "Treasury Bot",
        approvalId: "appr_1",
        ctaUrl: inboxHoldUrl("appr_1"),
      });
      assert.equal(await postSlackIncomingWebhook("http://example.com/hook", payload), false);
      assert.equal(calls.length, 0);
      assert.equal(
        await postSlackIncomingWebhook("https://hooks.slack.com/services/T/B/X", payload),
        true,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.url, "https://hooks.slack.com/services/T/B/X");
      const sent = JSON.parse(calls[0]?.body ?? "{}") as { text?: string; blocks?: unknown[] };
      assert.match(String(sent.text), /treated as a block/);
      assert.ok(Array.isArray(sent.blocks));
    } finally {
      globalThis.fetch = original;
    }
  });
});
