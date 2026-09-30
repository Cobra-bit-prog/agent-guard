/**
 * Easier human pay. Card only if STRIPE_SECRET_KEY is set.
 * Otherwise Base USDC + Solana USDC — no homepage rewrite.
 */
import { EVM_PAYOUT_ADDRESS } from "./evm-pay.ts";
import { newPayReference, parsePaidPlan, type PaidPlanId } from "./pay-invoice.ts";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT, buildSolanaPayUrl } from "./solana-pay.ts";

export const PLAN_USD: Record<PaidPlanId, number> = {
  starter: 29,
  pro: 49,
  team: 149,
};

export function cardConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function humanPayOptions(planRaw?: unknown) {
  const plan = parsePaidPlan(planRaw);
  const amount_usd = PLAN_USD[plan];
  return {
    plan,
    amount_usd,
    card: cardConfigured()
      ? { ready: true, url: "/api/v1/billing/card", note: "Pay with a card." }
      : {
          ready: false,
          note: "Card is off until Stripe is connected. Pay with a wallet you already have.",
        },
    base: {
      asset: "usdc",
      chain: "base",
      pay_to: EVM_PAYOUT_ADDRESS,
      amount_usd,
      note: "Same $29 on Base USDC if you already have Coinbase / MetaMask.",
    },
    solana: {
      asset: "usdc",
      chain: "solana",
      pay_to: SOLANA_PAYOUT_ADDRESS,
      mint: USDC_MINT,
      amount_usd,
      pay_url: buildSolanaPayUrl({
        recipient: SOLANA_PAYOUT_ADDRESS,
        amountUsdc: amount_usd,
        reference: newPayReference(),
        planName: plan,
      }),
    },
  };
}

export async function createCardSession(planRaw?: unknown): Promise<
  | { ok: true; url: string; plan: PaidPlanId; amount_usd: number }
  | { ok: false; error: string; http: number; pay: ReturnType<typeof humanPayOptions> }
> {
  const pay = humanPayOptions(planRaw);
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return { ok: false, error: "Card is off. Pay on Base or Solana.", http: 501, pay };
  }
  const origin = process.env.PUBLIC_ORIGIN?.trim() || "https://agent-control.net";
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      mode: "payment",
      success_url: `${origin}/inbox?paid=1`,
      cancel_url: `${origin}/billing/pay`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(Math.round(pay.amount_usd * 100)),
      "line_items[0][price_data][product_data][name]": `Agent Control ${pay.plan}`,
    }),
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    return {
      ok: false,
      error: data.error?.message || "Card checkout failed.",
      http: 502,
      pay,
    };
  }
  return { ok: true, url: data.url, plan: pay.plan, amount_usd: pay.amount_usd };
}
