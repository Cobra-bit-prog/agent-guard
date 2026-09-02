import type { VerdictAction } from "@/lib/policy";

/** How long an Inbox hold waits before the agent must abort. */
export const HOLD_TTL_MS = 10 * 60 * 1000;

export type ApprovalPollStatus = "hold" | "allow" | "always" | "block" | "expired";

/**
 * First-time destinations (not on the allowlist, never a real successful send)
 * wait in Inbox even when the amount is otherwise in policy.
 *
 * Presign "Allow once" rows are recorded as success so they must not count as
 * a seen destination — otherwise Allow once would permanently unlock the dest.
 */
export function shouldHoldFirstTimeDestination(input: {
  action: VerdictAction;
  dest: string;
  allowlist: string[];
  seenSuccessDestinations: string[];
}): boolean {
  if (input.action !== "allow" && input.action !== "alert") return false;
  const dest = input.dest.trim().toLowerCase();
  if (!dest) return false;
  const allow = input.allowlist.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (allow.includes(dest)) return false;
  const seen = new Set(
    input.seenSuccessDestinations.map((a) => a.trim().toLowerCase()).filter(Boolean),
  );
  return !seen.has(dest);
}

/** Map a stored approval row to the agent-facing poll decision. Expired = abort. */
export function pollDecisionFromStatus(status: ApprovalPollStatus): "allow" | "hold" | "block" {
  if (status === "allow" || status === "always") return "allow";
  if (status === "hold") return "hold";
  return "block";
}
