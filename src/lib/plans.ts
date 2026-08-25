export const FREE_TRIAL_DAYS = 3;

export const PLANS = {
  free: {
    id: "free" as const,
    name: "Free",
    price: 0,
    agents: 2,
    historyDays: 7,
    durationDays: FREE_TRIAL_DAYS,
    blurb: "Full console for 3 days. Then a paid plan is required to keep monitoring.",
  },
  starter: {
    id: "starter" as const,
    name: "Starter",
    price: 29,
    agents: 5,
    historyDays: 30,
    durationDays: null,
    blurb: "For operators running a small agent fleet.",
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    price: 49,
    agents: 15,
    historyDays: 90,
    durationDays: null,
    blurb: "Priority alerts and deeper history.",
  },
  team: {
    id: "team" as const,
    name: "Team",
    price: 149,
    agents: 50,
    historyDays: 365,
    durationDays: null,
    blurb: "Multiple seats and higher limits.",
  },
} as const;

export type PlanId = keyof typeof PLANS;

export type Entitlement = {
  plan: PlanId;
  status: "trialing" | "active" | "expired";
  trialEndsAt: string | null;
  expired: boolean;
  writable: boolean;
  agentLimit: number;
  msLeft: number;
};

export function planLimit(plan: string) {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "free"].agents;
}

export function evaluateEntitlement(row: {
  plan: string;
  status?: string;
  trial_ends_at?: string | null;
}): Entitlement {
  const plan: PlanId = row.plan in PLANS ? (row.plan as PlanId) : "free";
  if (plan !== "free") {
    return {
      plan,
      status: "active",
      trialEndsAt: null,
      expired: false,
      writable: true,
      agentLimit: planLimit(plan),
      msLeft: 0,
    };
  }
  const end = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const msLeft = Math.max(0, end - Date.now());
  const expired = !row.trial_ends_at || Date.now() >= end;
  return {
    plan: "free",
    status: expired ? "expired" : "trialing",
    trialEndsAt: row.trial_ends_at ?? null,
    expired,
    writable: !expired,
    agentLimit: PLANS.free.agents,
    msLeft,
  };
}

export function formatTrialLeft(msLeft: number) {
  const h = Math.ceil(msLeft / 3_600_000);
  if (h <= 0) return "expired";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} left`;
  const d = Math.ceil(h / 24);
  return `${d} day${d === 1 ? "" : "s"} left`;
}
