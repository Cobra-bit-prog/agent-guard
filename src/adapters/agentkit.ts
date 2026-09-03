/**
 * Coinbase AgentKit-shaped policy helper.
 * Matches PolicyProvider.evaluate(ActionContext) from AgentKit's policy hook
 * (RFC: optional policyProvider on BasePayConfig).
 * Calls POST /api/v1/check. Does not sign or send.
 */

import { createCheckClient, type CheckClientOptions, type CheckOutcome } from "./check-client.ts";

/** AgentKit ActionContext fields we need for a spend check. */
export type AgentKitActionContext = {
  action: string;
  to?: string;
  amount_usdc?: string;
  aggregate_usdc?: string;
  recipient_count?: number;
  per_recipient_max?: string;
  transfer_mechanism?: "direct" | "eip3009" | "permit" | "x402";
  creates_recurring_obligation?: boolean;
  creates_commitment?: boolean;
};

/** AgentKit PolicyDecision: allow false means do not send. */
export type AgentKitPolicyDecision = {
  allow: boolean;
  reason?: string;
  signals?: {
    verdict: "allow" | "wait" | "stop";
    decision?: string;
    poll_url?: string | null;
    approval_id?: string | null;
    check_id?: string;
  };
};

export type AgentKitPolicyProvider = {
  evaluate: (ctx: AgentKitActionContext) => Promise<AgentKitPolicyDecision>;
};

function usdFromAgentKit(ctx: AgentKitActionContext): number | null {
  const raw = ctx.amount_usdc ?? ctx.aggregate_usdc;
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function decisionFromOutcome(outcome: CheckOutcome): AgentKitPolicyDecision {
  if (!outcome.ok) {
    return {
      allow: false,
      reason: outcome.error,
      signals: { verdict: "stop" },
    };
  }
  const reason = outcome.check.reasons[0];
  if (outcome.verdict === "allow") {
    return {
      allow: true,
      reason,
      signals: {
        verdict: "allow",
        decision: outcome.check.decision,
        check_id: outcome.check.check_id,
      },
    };
  }
  return {
    allow: false,
    reason:
      reason ?? (outcome.verdict === "wait" ? "Held — wait for Approval Inbox." : "Do not send."),
    signals: {
      verdict: outcome.verdict,
      decision: outcome.check.decision,
      poll_url: outcome.check.poll_url,
      approval_id: outcome.check.approval_id,
      check_id: outcome.check.check_id,
    },
  };
}

/**
 * Drop-in for AgentKit `policyProvider`. Ask before every send.
 * Wait (hold) and stop (block) both return allow: false so money does not move.
 */
export function createAgentKitPolicyProvider(options: CheckClientOptions): AgentKitPolicyProvider {
  const client = createCheckClient(options);
  return {
    async evaluate(ctx: AgentKitActionContext): Promise<AgentKitPolicyDecision> {
      const to = String(ctx.to ?? "").trim();
      const valueUsd = usdFromAgentKit(ctx);
      if (!to || valueUsd === null) {
        return {
          allow: false,
          reason: "Provide a destination and amount.",
          signals: { verdict: "stop" },
        };
      }
      const outcome = await client.check({ to, value_usd: valueUsd });
      return decisionFromOutcome(outcome);
    },
  };
}

/** Simple "can I send this?" helper — same check, no AgentKit types required. */
export async function checkBeforeSend(
  options: CheckClientOptions,
  input: { to: string; valueUsd: number; native?: string },
): Promise<CheckOutcome> {
  return createCheckClient(options).check({
    to: input.to,
    value_usd: input.valueUsd,
    native: input.native,
  });
}
