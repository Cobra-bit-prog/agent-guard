/**
 * One-time Stripe Checkout for Hire us.
 * Same pattern as src/lib/easy-pay.ts: STRIPE_SECRET_KEY plus inline price_data.
 * No Stripe Price ID. If the key is unset, the intake form does not charge.
 *
 * Admin:
 * - STRIPE_SECRET_KEY — required for card checkout. Same key as POST /api/v1/billing/card.
 * - RESEND_API_KEY — mail to support@agent-control.net and the customer.
 * - EMAIL_FROM — optional. Default Agent Control <noreply@agent-control.net>.
 * - PUBLIC_ORIGIN — optional success and cancel URLs. Default https://agent-control.net.
 * Do not create Stripe Price IDs for these packages.
 * Do not attach the $49/month Action Gate subscription to Action Gate setup.
 */
import type { HirePackageId } from "./packages.ts";

export function hireCardConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function hirePublicOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PUBLIC_ORIGIN?.trim() || "https://agent-control.net";
  return raw.replace(/\/$/, "");
}

/** Stripe replaces this token only when the braces are left unencoded. */
export const CHECKOUT_SESSION_TOKEN = "{CHECKOUT_SESSION_ID}";

export function hireCheckoutFormBody(input: {
  orderId: string;
  packageId: HirePackageId;
  packageName: string;
  amountUsd: number;
  email: string;
  origin: string;
}): string {
  const params = new URLSearchParams({
    mode: "payment",
    customer_email: input.email,
    cancel_url: `${input.origin}/hire?package=${input.packageId}`,
    client_reference_id: input.orderId,
    "metadata[order_id]": input.orderId,
    "metadata[package_id]": input.packageId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Math.round(input.amountUsd * 100)),
    "line_items[0][price_data][product_data][name]": input.packageName,
    "line_items[0][price_data][product_data][description]":
      "One-time service from Agent Control. Our team does the work after you pay.",
  });
  const success = `${input.origin}/hire/thanks?session_id=`;
  return `${params.toString()}&success_url=${encodeURIComponent(success)}${CHECKOUT_SESSION_TOKEN}`;
}

export type HireCheckoutSession = {
  id: string;
  url?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: { order_id?: string; package_id?: string } | null;
};

type StripeErrorBody = { error?: { message?: string } };

export class HireCheckoutError extends Error {
  http: number;

  constructor(message: string, http = 502) {
    super(message);
    this.name = "HireCheckoutError";
    this.http = http;
  }
}

export function parseCheckoutSession(data: unknown): HireCheckoutSession | null {
  if (!data || typeof data !== "object") return null;
  const row = data as HireCheckoutSession;
  if (typeof row.id !== "string" || !row.id.startsWith("cs_")) return null;
  return row;
}

export async function createHireCheckoutSession(
  input: {
    orderId: string;
    packageId: HirePackageId;
    packageName: string;
    amountUsd: number;
    email: string;
    origin: string;
  },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new HireCheckoutError("Card checkout is off.", 501);
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: hireCheckoutFormBody(input),
  });
  const data = (await res.json().catch(() => ({}))) as StripeErrorBody & HireCheckoutSession;
  const session = parseCheckoutSession(data);
  if (!res.ok || !session?.url) {
    throw new HireCheckoutError(data.error?.message || "Card checkout failed.");
  }
  return { id: session.id, url: session.url };
}

export function isCheckoutSessionId(value: string): boolean {
  return /^cs_[A-Za-z0-9_]+$/.test(value);
}

export async function retrieveHireCheckoutSession(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<HireCheckoutSession> {
  if (!isCheckoutSessionId(sessionId)) {
    throw new HireCheckoutError("That payment link is not valid.", 400);
  }
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new HireCheckoutError("Card checkout is off.", 501);
  const res = await fetchImpl(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { authorization: `Bearer ${key}` } },
  );
  const data = (await res.json().catch(() => ({}))) as StripeErrorBody & HireCheckoutSession;
  const session = parseCheckoutSession(data);
  if (!res.ok || !session) {
    throw new HireCheckoutError(data.error?.message || "Could not confirm this payment.");
  }
  return session;
}

export function sessionMatchesOrder(
  session: HireCheckoutSession,
  order: { id: string; amount_usd: number },
): boolean {
  const orderId = session.metadata?.order_id || session.client_reference_id || "";
  if (orderId !== order.id) return false;
  if (session.payment_status !== "paid") return false;
  if (session.currency && session.currency !== "usd") return false;
  if (session.amount_total !== order.amount_usd * 100) return false;
  return true;
}
