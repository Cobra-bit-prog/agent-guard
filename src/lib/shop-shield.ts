/**
 * Shop Shield — a shop monthly fee for gate + support.
 * Same Solana USDC receive address as Human plans. It does not open Human Inbox seats.
 * Agents still buy stamp_tx themselves. Stamp verify stays public.
 *
 * Turn a shop on by adding a row to src/data/shop-shield.json and shipping it:
 * { "seller": "acme", "host": "pay.acme.example", "paid_until": "2026-10-26" }
 * Empty customers means nobody is on yet.
 */
import { PLANS } from "./plans.ts";

export const SHOP_SHIELD_PLAN = "shield" as const;
export const SHOP_SHIELD_PRICE_USD = 49;
export const SHOP_SHIELD_PRODUCT = "Shop Shield" as const;
export const SHOP_SHIELD_HREF = "/billing/pay?plan=shield";
/** Seller note. Meter stamp_tx lines stay as they are. */
export const SHOP_SHIELD_STAMP_NOTE =
  "Shop Shield $49/mo — pay at /billing/pay?plan=shield";

export const SHOP_SHIELD_COPY = {
  title: "Shop Shield — gate + verify for your host.",
  body: "Send $49 USDC on Solana. Agents buy the five-cent ticket.",
  cta: "Pay $49",
  waiting: "Waiting for $49 USDC on Solana.",
  done: "Paid. Agents still buy the five-cent ticket.",
  warn: "Use a wallet. Do not send from Coinbase or Binance.",
  trialMail: "Shop Shield is $49 a month. Agents buy the five-cent ticket.",
} as const;

const HUMAN_PLANS = ["starter", "pro", "team"] as const;
export type HumanPlanId = (typeof HUMAN_PLANS)[number];
export type PayPlanId = HumanPlanId | typeof SHOP_SHIELD_PLAN;

export function isShopShieldPlan(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === SHOP_SHIELD_PLAN;
}

/** Pay-page plan. Unknown values stay on Starter. Shield stays Shield. */
export function parsePayPlan(value: unknown): PayPlanId {
  const id = String(value ?? "starter").trim().toLowerCase();
  if (id === SHOP_SHIELD_PLAN) return SHOP_SHIELD_PLAN;
  return (HUMAN_PLANS as readonly string[]).includes(id) ? (id as HumanPlanId) : "starter";
}

export function payPlanQuote(plan: unknown): { id: PayPlanId; name: string; price: number } {
  const id = parsePayPlan(plan);
  if (id === SHOP_SHIELD_PLAN) {
    return { id, name: SHOP_SHIELD_PRODUCT, price: SHOP_SHIELD_PRICE_USD };
  }
  return { id, name: PLANS[id].name, price: PLANS[id].price };
}

/**
 * Human Inbox plan to activate after payment.
 * Shop Shield returns null so a $49 shop invoice does not open Pro seats.
 * Any other value keeps the existing Starter fallback.
 */
export function humanInboxPlan(plan: unknown): HumanPlanId | null {
  if (isShopShieldPlan(plan)) return null;
  const id = parsePayPlan(plan);
  return id === SHOP_SHIELD_PLAN ? null : id;
}

export type ShieldCustomer = {
  seller?: string;
  host?: string;
  paid_until?: string;
};

export type ShieldStatus = {
  on: boolean;
  seller: string | null;
  host: string | null;
  paid_until: string | null;
  product: typeof SHOP_SHIELD_PRODUCT;
};

export type ShieldStatusResult = ShieldStatus | { error: string };

const SELLER_RE = /^[a-z0-9][a-z0-9._-]*$/;
const HOST_RE = /^[a-z0-9.-]+$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSeller(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const seller = value.trim().toLowerCase().replace(/^@/, "");
  if (!seller || seller.length > 80 || !SELLER_RE.test(seller)) return null;
  return seller;
}

export function normalizeHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let host = value.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  host = host.split("/")[0] ?? "";
  host = host.replace(/:\d+$/, "");
  host = host.replace(/\.$/, "");
  if (!host || host.length > 253 || host.includes("..") || !HOST_RE.test(host)) return null;
  return host;
}

function paidUntilDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
  return DAY_RE.test(day) ? day : null;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Informational only. A shop can be off here and still verify stamps for free.
 */
export function shieldStatusFromSearch(
  search: { seller?: unknown; host?: unknown },
  customers: readonly ShieldCustomer[],
  now: Date = new Date(),
): ShieldStatusResult {
  const seller = normalizeSeller(search.seller);
  const host = normalizeHost(search.host);
  if (!seller && !host) {
    return { error: "Provide a seller or a host." };
  }
  if ((hasText(search.seller) && !seller && !host) || (hasText(search.host) && !host && !seller)) {
    return { error: "Provide a seller or a host." };
  }

  const today = now.toISOString().slice(0, 10);
  let best: { customer: ShieldCustomer; score: number; active: boolean; until: string } | null =
    null;

  for (const customer of customers) {
    const sellerHit = Boolean(seller && normalizeSeller(customer.seller) === seller);
    const hostHit = Boolean(host && normalizeHost(customer.host) === host);
    if (!sellerHit && !hostHit) continue;
    const score = sellerHit && hostHit ? 2 : 1;
    const until = paidUntilDay(customer.paid_until);
    const active = until !== null && until >= today;
    const untilKey = until ?? "";
    if (
      !best ||
      score > best.score ||
      (score === best.score && active && !best.active) ||
      (score === best.score && active === best.active && untilKey > best.until)
    ) {
      best = { customer, score, active, until: untilKey };
    }
  }

  if (!best) {
    return {
      on: false,
      seller,
      host,
      paid_until: null,
      product: SHOP_SHIELD_PRODUCT,
    };
  }

  return {
    on: best.active,
    seller: normalizeSeller(best.customer.seller) ?? seller,
    host: normalizeHost(best.customer.host) ?? (host || null),
    paid_until: paidUntilDay(best.customer.paid_until),
    product: SHOP_SHIELD_PRODUCT,
  };
}
