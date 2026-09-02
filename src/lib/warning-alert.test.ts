import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WARNING_EMAIL_DEDUP_MS,
  absoluteAppUrl,
  isWithinDedupWindow,
  shouldInsertNearLimitAlert,
  warningKindForDecision,
  warningNoticeMessage,
  warningNoticeToken,
} from "./warning-alert.ts";

describe("warningKindForDecision", () => {
  it("prefers block, then hold, then policy alert, over near-limit", () => {
    assert.equal(warningKindForDecision("block", true), "block");
    assert.equal(warningKindForDecision("hold", true), "hold");
    assert.equal(warningKindForDecision("alert", true), "alert");
    assert.equal(warningKindForDecision("allow", true), "near_limit");
    assert.equal(warningKindForDecision("allow", false), null);
  });

  it("only inserts a near_limit console row when the check is still allow", () => {
    assert.equal(shouldInsertNearLimitAlert("allow", true), true);
    assert.equal(shouldInsertNearLimitAlert("alert", true), false);
    assert.equal(shouldInsertNearLimitAlert("hold", true), false);
    assert.equal(shouldInsertNearLimitAlert("block", true), false);
    assert.equal(shouldInsertNearLimitAlert("allow", false), false);
  });
});

describe("warning email dedup", () => {
  it("builds a stable user+agent+kind token for notification_log", () => {
    assert.equal(warningNoticeToken("hold", "agent-1"), "[hold:agent-1]");
    assert.match(
      warningNoticeMessage("near_limit", "agent-1", "at 82% of cap"),
      /^\[near_limit:agent-1\] at 82% of cap$/,
    );
  });

  it("treats a recent notice as a duplicate inside the 45-minute window", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z");
    const inside = new Date(now - WARNING_EMAIL_DEDUP_MS + 60_000).toISOString();
    const outside = new Date(now - WARNING_EMAIL_DEDUP_MS - 60_000).toISOString();
    assert.equal(isWithinDedupWindow(inside, now), true);
    assert.equal(isWithinDedupWindow(outside, now), false);
    assert.equal(isWithinDedupWindow(null, now), false);
  });

  it("points holds at Inbox and other kinds at Alerts", () => {
    assert.equal(absoluteAppUrl("/inbox"), "https://agent-control.net/inbox");
    assert.equal(absoluteAppUrl("/alerts"), "https://agent-control.net/alerts");
  });
});
