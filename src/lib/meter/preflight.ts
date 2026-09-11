export type PreflightDecision = "allow" | "stop";

/** Meter preflight never holds. allow | stop only. */

export function utcDayKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function evaluatePreflightSelf(input: {
  cap_usd: number;
  value_usd: number;
  spent_today_usd: number;
}): {
  decision: PreflightDecision;
  must_abort: boolean;
  reason: string;
  cap_usd: number;
  spent_today_usd: number;
  remaining_usd: number;
  value_usd: number;
} {
  const cap = Number(input.cap_usd);
  const value = Number(input.value_usd);
  const spent = Math.max(0, Number(input.spent_today_usd) || 0);

  if (!Number.isFinite(cap) || cap <= 0) {
    return result("stop", "invalid_cap cap_usd must be > 0.", cap, spent, value);
  }
  if (!Number.isFinite(value) || value <= 0) {
    return result("stop", "invalid_value value_usd must be > 0.", cap, spent, value);
  }
  if (value > cap) {
    return result("stop", "over_cap value_usd exceeds cap_usd.", cap, spent, value);
  }
  if (spent + value > cap) {
    return result("stop", "daily_cap spent_today + value exceeds cap_usd.", cap, spent, value);
  }
  return result("allow", "within_cap Under the self-declared cap.", cap, spent, value);
}

function result(
  decision: PreflightDecision,
  reason: string,
  cap: number,
  spent: number,
  value: number,
) {
  const remaining = Math.max(0, (Number.isFinite(cap) ? cap : 0) - spent - (decision === "allow" ? value : 0));
  return {
    decision,
    must_abort: decision === "stop",
    reason,
    cap_usd: cap,
    spent_today_usd: spent,
    remaining_usd: remaining,
    value_usd: value,
  };
}
