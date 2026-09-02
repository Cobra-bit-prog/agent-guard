import { PAY_ASSET_CHAIN, asPayAsset, type PayAsset } from "./pay-asset.ts";
import type { PayChain } from "./solana-pay.ts";
import { absoluteAppUrl } from "./warning-alert.ts";

/** Same plan / asset / chain unions as `createPayRequest` in solana-billing. */
export const PAID_PLANS = ["starter", "pro", "team"] as const;
export const PAY_ASSETS = ["usdc", "sol", "eth"] as const;
export const PAY_CHAINS = ["solana", "ethereum", "base"] as const;

export type PaidPlanId = (typeof PAID_PLANS)[number];

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
};

export type AgentCheckoutResult =
  { ok: true; result: CheckoutResponse } | { ok: false; status: number; error: string };

export type AgentCheckoutAgent = {
  id: string;
  user_id: string;
};

export type AgentCheckoutDeps = {
  lookupAgentByApiKey: (apiKey: string) => Promise<AgentCheckoutAgent | null>;
  findOpenPayRequest: (
    key: ResolvedCheckout & { userId: string },
  ) => Promise<CheckoutPayRequest | null>;
  createPayRequest: (userId: string, input: ResolvedCheckout) => Promise<CheckoutPayRequest>;
};

/** Payout address missing for the requested asset/chain. Maps to HTTP 503. */
export class CheckoutNotConfiguredError extends Error {
  constructor(message = "Checkout is not configured.") {
    super(message);
    this.name = "CheckoutNotConfiguredError";
  }
}

export const CHECKOUT_USAGE = {
  usage: "POST /api/v1/billing/checkout with Authorization: Bearer <agent api key>",
  body: {
    plan: "starter" as const,
    asset: "usdc" as const,
    chain: "solana" as const,
  },
  note: "Opens a pay request on the human account that owns this agent. The human pays at pay_url. The plan credits the human account. Not automatic payment.",
};

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

/** Human pay page for this request — same `id` search param as `billing.pay.tsx`. */
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
): { ok: true; data: ResolvedCheckout } | { ok: false; status: number; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Invalid checkout body." };
  }
  const rec = body as Record<string, unknown>;
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
export function principalUserIdFromAgent(agent: AgentCheckoutAgent): string {
  return agent.user_id;
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
  };
}

export async function runAgentCheckout(
  input: { apiKey: string; body: unknown },
  deps: AgentCheckoutDeps,
): Promise<AgentCheckoutResult> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { ok: false, status: 401, error: "Missing API key." };

  const parsed = parseCheckoutBody(input.body);
  if (!parsed.ok) return parsed;

  const agent = await deps.lookupAgentByApiKey(apiKey);
  if (!agent) return { ok: false, status: 401, error: "Unknown API key." };

  const userId = principalUserIdFromAgent(agent);
  const open = await deps.findOpenPayRequest({ userId, ...parsed.data });
  if (open) return { ok: true, result: toCheckoutResponse(open) };

  try {
    const created = await deps.createPayRequest(userId, parsed.data);
    return { ok: true, result: toCheckoutResponse(created) };
  } catch (err) {
    if (err instanceof CheckoutNotConfiguredError) {
      return { ok: false, status: 503, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Could not start checkout.";
    return { ok: false, status: 500, error: message };
  }
}
