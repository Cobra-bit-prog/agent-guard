import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  claimedPaidPlanName,
  nonInboxPaidPlanName,
  shouldNotifyClaimedInvoice,
} from "./paid-subscriber-notify.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("paid subscriber notify", () => {
  it("keeps Human Starter/Pro/Team on the existing inbox notify", () => {
    assert.equal(nonInboxPaidPlanName("starter"), null);
    assert.equal(nonInboxPaidPlanName("pro"), null);
    assert.equal(nonInboxPaidPlanName("team"), null);
    assert.equal(nonInboxPaidPlanName("Starter"), null);
  });

  it("names Action Gate and Shop Shield once", () => {
    assert.equal(nonInboxPaidPlanName("action"), "Action Gate");
    assert.equal(nonInboxPaidPlanName("ACTION"), "Action Gate");
    assert.equal(nonInboxPaidPlanName("shield"), "Shop Shield");
    assert.equal(nonInboxPaidPlanName("Shield"), "Shop Shield");
  });

  it("claim names Human, Action Gate, and Shop Shield", () => {
    assert.equal(claimedPaidPlanName("starter"), "Starter");
    assert.equal(claimedPaidPlanName("pro"), "Pro");
    assert.equal(claimedPaidPlanName("team"), "Team");
    assert.equal(claimedPaidPlanName("action"), "Action Gate");
    assert.equal(claimedPaidPlanName("shield"), "Shop Shield");
  });

  it("notifies a claim only for invoices that were still guest pays", () => {
    assert.equal(shouldNotifyClaimedInvoice("guest:inv_1"), true);
    assert.equal(shouldNotifyClaimedInvoice(null), true);
    assert.equal(shouldNotifyClaimedInvoice("user_123"), false);
  });

  it("wires Action/Shield notify beside entitlement and claim without a second Human send", () => {
    const core = readFileSync(join(ROOT, "src/lib/server/billing-core.server.ts"), "utf8");
    const solana = readFileSync(join(ROOT, "src/lib/server/solana-billing.ts"), "utf8");
    for (const source of [core, solana]) {
      assert.match(source, /planName: PLANS\[inbox\]\.name/);
      assert.match(source, /nonInboxPaidPlanName\(row\.plan\)/);
      assert.match(source, /notifyPaidSubscriber\(/);
      const humanSends = source.match(/sendNewSubscriberNotifyEmail\(/g) ?? [];
      assert.equal(humanSends.length, 1);
    }
    assert.match(core, /shouldNotifyClaimedInvoice\(previousUserId\)/);
    assert.match(core, /claimedPaidPlanName\(row\.plan\)/);
    assert.match(
      core,
      /if \(isActionGatePlan\(row\.plan\)\) await applyActionEntitlement\(userId\)/,
    );
    assert.match(
      solana,
      /if \(isActionGatePlan\(row\.plan\)\) await applyActionEntitlement\(context\.userId\)/,
    );
  });
});
