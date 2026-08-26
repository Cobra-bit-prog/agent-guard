export type PolicyInput = {
  daily_limit_usd: number;
  max_tx_amount_usd: number;
  alert_threshold_usd: number;
  allowlist: string[];
  denylist: string[];
  max_hourly_txs: number;
};

export type Verdict = {
  action: "allow" | "alert" | "block";
  reasons: string[];
};

function norm(addr: string) {
  return addr.trim().toLowerCase();
}

export function evaluateTransfer(input: {
  valueUsd: number;
  to: string;
  usedTodayUsd: number;
  txsLastHour: number;
  paused: boolean;
  policy: PolicyInput;
}): Verdict {
  const reasons: string[] = [];
  let action: Verdict["action"] = "allow";
  const block = (r: string) => {
    reasons.push(r);
    action = "block";
  };
  const alert = (r: string) => {
    reasons.push(r);
    if (action !== "block") action = "alert";
  };

  const to = norm(input.to);
  const allow = input.policy.allowlist.map(norm).filter(Boolean);
  const deny = input.policy.denylist.map(norm).filter(Boolean);

  if (input.paused) block("Agent is paused — all transfers are held.");
  if (deny.includes(to)) block("Destination is on the denylist.");
  if (allow.length > 0 && to && !allow.includes(to)) {
    block("Destination is not on the allowlist.");
  }
  if (input.valueUsd > input.policy.max_tx_amount_usd) {
    block(
      `Amount exceeds max transaction of $${input.policy.max_tx_amount_usd.toFixed(0)}.`,
    );
  }
  if (input.usedTodayUsd + input.valueUsd > input.policy.daily_limit_usd) {
    block(
      `Would exceed daily spend cap of $${input.policy.daily_limit_usd.toFixed(0)}.`,
    );
  }
  if (input.txsLastHour >= input.policy.max_hourly_txs) {
    block(`Hourly velocity cap of ${input.policy.max_hourly_txs} txs reached.`);
  }
  if (input.valueUsd >= input.policy.alert_threshold_usd) {
    alert(
      `Amount is at or above the alert threshold of $${input.policy.alert_threshold_usd.toFixed(0)}.`,
    );
  }

  if (reasons.length === 0) reasons.push("Within policy limits.");
  return { action, reasons };
}

export function protectionScore(input: {
  agentCount: number;
  allowlisted: number;
  tightTxCap: number;
  openCritical: number;
  paid: boolean;
  expired: boolean;
}): { score: number; label: "Exposed" | "Hardened" | "Protected"; notes: string[] } {
  const notes: string[] = [];
  if (input.expired) {
    return {
      score: 0,
      label: "Exposed",
      notes: ["Trial ended — monitoring is paused until you upgrade."],
    };
  }
  if (input.agentCount === 0) {
    return {
      score: 5,
      label: "Exposed",
      notes: ["No agents enrolled. Nothing is being watched."],
    };
  }

  let score = 20;
  const allowPct = input.allowlisted / input.agentCount;
  score += Math.round(allowPct * 30);
  if (allowPct < 1) {
    notes.push(
      `${input.agentCount - input.allowlisted} agent${input.agentCount - input.allowlisted === 1 ? "" : "s"} allow any destination.`,
    );
  } else {
    notes.push("Every agent has an allowlist.");
    score += 5;
  }

  const tightPct = input.tightTxCap / input.agentCount;
  score += Math.round(tightPct * 20);
  if (tightPct < 0.5) {
    notes.push("Single-tx caps are loose versus daily limits.");
  }

  if (input.openCritical > 0) {
    score -= Math.min(25, input.openCritical * 10);
    notes.push(`${input.openCritical} unacknowledged critical alert${input.openCritical === 1 ? "" : "s"}.`);
  } else {
    score += 10;
    notes.push("No open critical alerts.");
  }

  if (input.paid) {
    score += 15;
    notes.push("Paid plan — monitoring stays on.");
  } else {
    notes.push("On a 1-day trial. Upgrade before coverage can be considered.");
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? "Protected" : score >= 55 ? "Hardened" : "Exposed";
  return { score, label, notes };
}
