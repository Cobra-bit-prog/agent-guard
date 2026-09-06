import { FREE_TRIAL_DAYS, FREE_TRIAL_HOURS, PLANS, type Entitlement, type PlanId } from "./plans.ts";
import { PAY_ASSET_CHAIN, asPayAsset, type PayAsset } from "./pay-asset.ts";
import type { PayChain } from "./solana-pay.ts";
import { APP_ORIGIN, absoluteAppUrl } from "./warning-alert.ts";

/** Locked product line: human is customer of record. */
export const HUMAN_PRINCIPAL_LINE =
  "A human principal signs up and owns billing and Approval Inbox; agents connect under that account.";

export const STOREFRONT_NO_AGENT_ROOT =
  "Agents cannot open a root account. A human principal must sign up and own billing and Approval Inbox.";

export const STOREFRONT_NO_INBOX_DECIDE =
  "Agents cannot decide Approval Inbox. A human principal owns those decisions.";

export const STOREFRONT_NO_VIRTUAL_CARD = "No virtual cards. Pay on-chain in USDC on Solana.";

export const PAID_PLANS = ["starter", "pro", "team"] as const;
export const PAY_ASSETS = ["usdc", "sol", "eth"] as const;
export const PAY_CHAINS = ["solana", "ethereum", "base"] as const;

export type PaidPlanId = (typeof PAID_PLANS)[number];

export type StorefrontPlan = {
  id: PaidPlanId;
  name: string;
  price_usd: number;
  agents: number;
  history_days: number;
  blurb: string;
};

export type StorefrontPricing = {
  product: string;
  tagline: string;
  human_principal: string;
  trial: {
    days: number;
    hours: number;
    card: false;
    kyc: false;
    plan: "free";
    note: string;
  };
  plans: StorefrontPlan[];
  pay: {
    method: "on-chain";
    asset: "USDC";
    chain: "solana";
    also: readonly string[];
    no_card: true;
    no_virtual_card: true;
    note: string;
  };
  connect: {
    check: string;
    mcp: string;
    docs: string;
  };
  storefront: {
    pricing: string;
    trial: string;
    attach: string;
    checkout: string;
    status: string;
    mcp_tools: readonly string[];
  };
};

export const STOREFRONT_MCP_TOOLS = [
  "get_pricing",
  "start_trial",
  "attach_human",
  "create_checkout",
  "get_status",
] as const;

export function listPaidPlans(): StorefrontPlan[] {
  return PAID_PLANS.map((id) => {
    const plan = PLANS[id];
    return {
      id,
      name: plan.name,
      price_usd: plan.price,
      agents: plan.agents,
      history_days: plan.historyDays,
      blurb: plan.blurb,
    };
  });
}

export function getPricing(): StorefrontPricing {
  return {
    product: "Agent Control",
    tagline: "External audit for your agents",
    human_principal: HUMAN_PRINCIPAL_LINE,
    trial: {
      days: FREE_TRIAL_DAYS,
      hours: FREE_TRIAL_HOURS,
      card: false,
      kyc: false,
      plan: "free",
      note: "1-day full console trial, no card, no KYC. Then Starter $29 / Pro $49 / Team $149.",
    },
    plans: listPaidPlans(),
    pay: {
      method: "on-chain",
      asset: "USDC",
      chain: "solana",
      also: ["SOL", "ETH"],
      no_card: true,
      no_virtual_card: true,
      note: "DIY on-chain USDC (Solana) from Billing. A human principal pays. Agents cannot decide Approval Inbox.",
    },
    connect: {
      check: "POST /api/v1/check",
      mcp: "POST /api/v1/mcp",
      docs: `${APP_ORIGIN}/docs#connect-your-agent`,
    },
    storefront: {
      pricing: "GET /api/v1/storefront/pricing",
      trial: "POST /api/v1/storefront/trial",
      attach: "POST /api/v1/storefront/attach",
      checkout: "POST /api/v1/billing/checkout",
      status: "GET /api/v1/storefront/status",
      mcp_tools: STOREFRONT_MCP_TOOLS,
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase email, or null when missing / invalid. */
export function parseHumanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return null;
  return email;
}

export function parsePrincipalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.includes("@") || id.length > 128) return null;
  return id;
}

export type StorefrontPrincipal = {
  userId: string;
  email: string | null;
  entitlement: Entitlement;
};

export type StorefrontAgent = {
  id: string;
  userId: string;
};

export type StorefrontFail = { ok: false; status: number; error: string };
export type StorefrontOk<T> = { ok: true; result: T };

export type TrialInviteResult = {
  action: "invite_human";
  human_email: string;
  signup_url: string;
  trial: StorefrontPricing["trial"];
  human_principal: string;
  note: string;
};

export type TrialAttachedResult = {
  action: "attached" | "existing_principal";
  human_email: string | null;
  login_url: string;
  signup_url: string;
  status: StorefrontStatus;
  human_principal: string;
  note: string;
};

export type TrialResult = TrialInviteResult | TrialAttachedResult;

export type StorefrontStatus = {
  plan: PlanId;
  status: Entitlement["status"];
  trial_ends_at: string | null;
  period_ends_at: string | null;
  expired: boolean;
  writable: boolean;
  ms_left: number;
  agent_limit: number;
  human_principal: {
    owns_billing: true;
    owns_inbox: true;
    email: string | null;
  };
  pay: {
    checkout: string;
    asset: "USDC";
    chain: "solana";
  };
  note: string;
};

export function signupUrl(): string {
  return absoluteAppUrl("/signup");
}

export function loginUrl(): string {
  return absoluteAppUrl("/login");
}

export function statusFromEntitlement(
  ent: Entitlement,
  email: string | null = null,
): StorefrontStatus {
  return {
    plan: ent.plan,
    status: ent.status,
    trial_ends_at: ent.trialEndsAt,
    period_ends_at: ent.periodEndsAt,
    expired: ent.expired,
    writable: ent.writable,
    ms_left: ent.msLeft,
    agent_limit: ent.agentLimit,
    human_principal: {
      owns_billing: true,
      owns_inbox: true,
      email,
    },
    pay: {
      checkout: "POST /api/v1/billing/checkout",
      asset: "USDC",
      chain: "solana",
    },
    note: `${HUMAN_PRINCIPAL_LINE} ${STOREFRONT_NO_INBOX_DECIDE}`,
  };
}

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase() ?? "";
  const right = b?.trim().toLowerCase() ?? "";
  if (!left || !right) return false;
  return left === right;
}

function refuseAgentRoot(): StorefrontFail {
  return { ok: false, status: 400, error: STOREFRONT_NO_AGENT_ROOT };
}

function refuseInboxDecide(): StorefrontFail {
  return { ok: false, status: 403, error: STOREFRONT_NO_INBOX_DECIDE };
}

/** Agents never decide Inbox — storefront has no allow/block action. */
export function refuseAgentInboxApprove(action: unknown): StorefrontFail | null {
  if (typeof action !== "string") return null;
  const value = action.trim().toLowerCase();
  if (value === "allow" || value === "always" || value === "block" || value === "approve") {
    return refuseInboxDecide();
  }
  return null;
}

export function parseTrialBody(body: unknown): {
  email: string | null;
  principalId: string | null;
  error: string | null;
} {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { email: null, principalId: null, error: "JSON body required." };
  }
  const rec = body as Record<string, unknown>;
  const inbox = refuseAgentInboxApprove(rec.decision ?? rec.action);
  if (inbox) return { email: null, principalId: null, error: inbox.error };
  const email = parseHumanEmail(rec.human_email ?? rec.email);
  const principalId = parsePrincipalId(rec.principal_id ?? rec.principalId);
  if (!email && !principalId) {
    return {
      email: null,
      principalId: null,
      error: "Provide human_email or principal_id. Agents cannot open a root account.",
    };
  }
  return { email, principalId, error: null };
}

/**
 * Start a trial or attach this agent to a human principal.
 * Never creates a user. Trial starts when the human signs up.
 */
export function decideTrialOrAttach(input: {
  email: string | null;
  principalId: string | null;
  agent: StorefrontAgent | null;
  principal: StorefrontPrincipal | null;
}): StorefrontOk<TrialResult> | StorefrontFail {
  if (!input.email && !input.principalId) {
    return refuseAgentRoot();
  }

  if (input.agent && input.principal) {
    if (input.agent.userId !== input.principal.userId) {
      return {
        ok: false,
        status: 409,
        error: "This agent already belongs to a human principal. Agents cannot change the customer of record.",
      };
    }
    if (input.principalId && input.principalId !== input.principal.userId) {
      return {
        ok: false,
        status: 409,
        error: "This agent already belongs to a human principal. Agents cannot change the customer of record.",
      };
    }
    if (input.email && input.principal.email && !emailsMatch(input.email, input.principal.email)) {
      return {
        ok: false,
        status: 409,
        error: "This agent already belongs to a human principal. Agents cannot change the customer of record.",
      };
    }
    return {
      ok: true,
      result: {
        action: "attached",
        human_email: input.principal.email ?? input.email,
        login_url: loginUrl(),
        signup_url: signupUrl(),
        status: statusFromEntitlement(input.principal.entitlement, input.principal.email ?? input.email),
        human_principal: HUMAN_PRINCIPAL_LINE,
        note: `${HUMAN_PRINCIPAL_LINE} ${STOREFRONT_NO_INBOX_DECIDE}`,
      },
    };
  }

  if (input.agent && !input.principal) {
    return {
      ok: false,
      status: 404,
      error: "Human principal not found for this agent.",
    };
  }

  if (input.principal) {
    return {
      ok: true,
      result: {
        action: "existing_principal",
        human_email: input.principal.email ?? input.email,
        login_url: loginUrl(),
        signup_url: signupUrl(),
        status: statusFromEntitlement(input.principal.entitlement, input.principal.email ?? input.email),
        human_principal: HUMAN_PRINCIPAL_LINE,
        note: "This human already has an account. They own billing and Approval Inbox. Agents connect under that account.",
      },
    };
  }

  if (!input.email) {
    return refuseAgentRoot();
  }

  return {
    ok: true,
    result: {
      action: "invite_human",
      human_email: input.email,
      signup_url: signupUrl(),
      trial: getPricing().trial,
      human_principal: HUMAN_PRINCIPAL_LINE,
      note: STOREFRONT_NO_AGENT_ROOT,
    },
  };
}

export function storefrontInviteCopy(email: string): { subject: string; text: string } {
  return {
    subject: "An agent asked you to start Agent Control",
    text: [
      "An agent asked you to open Agent Control.",
      "",
      HUMAN_PRINCIPAL_LINE,
      "1-day trial. No card. No KYC. You keep the keys.",
      "",
      `Sign up: ${signupUrl()}`,
      "",
      STOREFRONT_NO_INBOX_DECIDE,
      STOREFRONT_NO_VIRTUAL_CARD,
      "",
      `If you did not expect this, ignore it. (${email})`,
    ].join("\n"),
  };
}

export type ResolvedCheckout = {
  plan: PaidPlanId;
  asset: PayAsset;
  chain: PayChain;
};

export type CheckoutPayRequest = {
  id: string;
  user_id: string;
  plan: string;
  asset: string;
  chain: string;
  amount_usdc: number;
  amount_base_units: string;
  recipient: string;
  reference: string;
  expires_at: string;
  status: string;
};

export type CheckoutResponse = {
  pay_request_id: string;
  plan: string;
  asset: PayAsset;
  chain: PayChain;
  amount_usdc: number;
  amount_base_units: string;
  recipient: string;
  reference: string;
  expires_at: string;
  pay_url: string;
  status: string;
  human_principal: { owns_billing: true; owns_inbox: true };
  note: string;
};

export const CHECKOUT_USAGE = {
  usage: "POST /api/v1/billing/checkout with Authorization: Bearer <agent api key>",
  body: {
    plan: "starter" as const,
    asset: "usdc" as const,
    chain: "solana" as const,
  },
  note: "Opens a pay request on the human account that owns this agent. The human pays at pay_url. The plan credits the human account. Not automatic payment. Agents cannot decide Approval Inbox.",
  wraps: "POST /api/v1/billing/checkout — agent key → pay request for the human principal.",
};

/** Payout address missing for the requested asset/chain. Maps to HTTP 503. */
export class CheckoutNotConfiguredError extends Error {
  constructor(message = "Checkout is not configured.") {
    super(message);
    this.name = "CheckoutNotConfiguredError";
  }
}

function asPayChain(value: string | null | undefined): PayChain {
  if (value === "ethereum" || value === "base" || value === "solana") return value;
  return "solana";
}

function isPaidPlan(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLANS as readonly string[]).includes(value);
}

function isPayAsset(value: unknown): value is PayAsset {
  return typeof value === "string" && (PAY_ASSETS as readonly string[]).includes(value);
}

function isPayChain(value: unknown): value is PayChain {
  return typeof value === "string" && (PAY_CHAINS as readonly string[]).includes(value);
}

export function checkoutPayUrl(payRequestId: string): string {
  return absoluteAppUrl(`/billing/pay?id=${encodeURIComponent(payRequestId)}`);
}

export function resolveCheckoutInput(data: {
  plan: PaidPlanId;
  asset?: PayAsset;
  chain?: PayChain;
}): ResolvedCheckout {
  const asset = data.asset ?? "usdc";
  const chain = data.chain ?? PAY_ASSET_CHAIN[asset];
  return { plan: data.plan, asset, chain };
}

export function parseCheckoutBody(
  body: unknown,
): { ok: true; data: ResolvedCheckout } | StorefrontFail {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Invalid checkout body." };
  }
  const rec = body as Record<string, unknown>;
  const inbox = refuseAgentInboxApprove(rec.decision ?? rec.action);
  if (inbox) return inbox;
  if (!isPaidPlan(rec.plan)) {
    return { ok: false, status: 400, error: "Provide plan as starter, pro, or team." };
  }
  if (rec.asset !== undefined && !isPayAsset(rec.asset)) {
    return { ok: false, status: 400, error: "Invalid asset or chain." };
  }
  if (rec.chain !== undefined && !isPayChain(rec.chain)) {
    return { ok: false, status: 400, error: "Invalid asset or chain." };
  }
  return {
    ok: true,
    data: resolveCheckoutInput({
      plan: rec.plan,
      asset: isPayAsset(rec.asset) ? rec.asset : undefined,
      chain: isPayChain(rec.chain) ? rec.chain : undefined,
    }),
  };
}

/** The billing principal is the agent's owner, never the agent row id. */
export function principalUserIdFromAgent(agent: StorefrontAgent): string {
  return agent.userId;
}

export function isReusableOpenPayRequest(
  row: {
    user_id: string;
    plan: string;
    asset: string | null;
    chain: string | null;
    status: string;
    expires_at: string;
  },
  key: { userId: string; plan: string; asset: PayAsset; chain: PayChain },
  nowMs = Date.now(),
): boolean {
  if (row.user_id !== key.userId) return false;
  if (row.plan !== key.plan) return false;
  if (asPayAsset(row.asset) !== key.asset) return false;
  if (asPayChain(row.chain) !== key.chain) return false;
  if (row.status !== "pending" && row.status !== "underpaid") return false;
  return new Date(row.expires_at).getTime() > nowMs;
}

export function toCheckoutResponse(row: CheckoutPayRequest): CheckoutResponse {
  return {
    pay_request_id: row.id,
    plan: row.plan,
    asset: asPayAsset(row.asset),
    chain: asPayChain(row.chain),
    amount_usdc: Number(row.amount_usdc),
    amount_base_units: String(row.amount_base_units),
    recipient: row.recipient,
    reference: row.reference,
    expires_at: row.expires_at,
    pay_url: checkoutPayUrl(row.id),
    status: row.status,
    human_principal: { owns_billing: true, owns_inbox: true },
    note: `${HUMAN_PRINCIPAL_LINE} Pay at pay_url. ${STOREFRONT_NO_INBOX_DECIDE} ${STOREFRONT_NO_VIRTUAL_CARD}`,
  };
}

export type CreateCheckoutDeps = {
  lookupAgentByApiKey: (apiKey: string) => Promise<StorefrontAgent | null>;
  findOpenPayRequest: (
    key: ResolvedCheckout & { userId: string },
  ) => Promise<CheckoutPayRequest | null>;
  createPayRequest: (userId: string, input: ResolvedCheckout) => Promise<CheckoutPayRequest>;
};

export async function runCreateCheckout(
  input: { apiKey: string; body: unknown },
  deps: CreateCheckoutDeps,
): Promise<StorefrontOk<CheckoutResponse> | StorefrontFail> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { ok: false, status: 401, error: "Missing API key." };

  const parsed = parseCheckoutBody(input.body);
  if (!parsed.ok) return parsed;

  const agent = await deps.lookupAgentByApiKey(apiKey);
  if (!agent) return { ok: false, status: 401, error: "Unknown API key." };

  const userId = principalUserIdFromAgent(agent);
  if (userId === agent.id) {
    return {
      ok: false,
      status: 409,
      error: "Checkout must credit the human principal, not the agent row.",
    };
  }

  const open = await deps.findOpenPayRequest({ userId, ...parsed.data });
  if (open) {
    if (open.user_id !== userId || open.user_id === agent.id) {
      return {
        ok: false,
        status: 409,
        error: "Checkout must credit the human principal, not the agent row.",
      };
    }
    return { ok: true, result: toCheckoutResponse(open) };
  }

  try {
    const created = await deps.createPayRequest(userId, parsed.data);
    if (created.user_id !== userId || created.user_id === agent.id) {
      return {
        ok: false,
        status: 409,
        error: "Checkout must credit the human principal, not the agent row.",
      };
    }
    return { ok: true, result: toCheckoutResponse(created) };
  } catch (err) {
    if (err instanceof CheckoutNotConfiguredError) {
      return { ok: false, status: 503, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Could not start checkout.";
    if (/not configured/i.test(message)) {
      return { ok: false, status: 503, error: message };
    }
    return { ok: false, status: 500, error: message };
  }
}

export type StatusDeps = {
  lookupAgentByApiKey: (apiKey: string) => Promise<StorefrontAgent | null>;
  lookupPrincipal: (userId: string) => Promise<StorefrontPrincipal | null>;
};

export async function runGetStatus(
  apiKey: string,
  deps: StatusDeps,
): Promise<StorefrontOk<StorefrontStatus> | StorefrontFail> {
  const key = apiKey.trim();
  if (!key) return { ok: false, status: 401, error: "Missing API key." };
  const agent = await deps.lookupAgentByApiKey(key);
  if (!agent) return { ok: false, status: 401, error: "Unknown API key." };
  const principal = await deps.lookupPrincipal(agent.userId);
  if (!principal) {
    return { ok: false, status: 404, error: "Human principal not found for this agent." };
  }
  return {
    ok: true,
    result: statusFromEntitlement(principal.entitlement, principal.email),
  };
}

export type TrialDeps = {
  lookupAgentByApiKey: (apiKey: string) => Promise<StorefrontAgent | null>;
  lookupPrincipalByEmail: (email: string) => Promise<StorefrontPrincipal | null>;
  lookupPrincipalById: (userId: string) => Promise<StorefrontPrincipal | null>;
};

export async function runStartTrialOrAttach(
  input: { apiKey: string; body: unknown },
  deps: TrialDeps,
): Promise<StorefrontOk<TrialResult> | StorefrontFail> {
  const parsed = parseTrialBody(input.body);
  if (parsed.error && !parsed.email && !parsed.principalId) {
    return { ok: false, status: 400, error: parsed.error };
  }

  const key = input.apiKey.trim();
  const agent = key ? await deps.lookupAgentByApiKey(key) : null;
  if (key && !agent) return { ok: false, status: 401, error: "Unknown API key." };

  let principal: StorefrontPrincipal | null = null;
  if (agent) {
    principal = await deps.lookupPrincipalById(agent.userId);
  } else if (parsed.principalId) {
    principal = await deps.lookupPrincipalById(parsed.principalId);
  } else if (parsed.email) {
    principal = await deps.lookupPrincipalByEmail(parsed.email);
  }

  return decideTrialOrAttach({
    email: parsed.email,
    principalId: parsed.principalId,
    agent,
    principal,
  });
}
