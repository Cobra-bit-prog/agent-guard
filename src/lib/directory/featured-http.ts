import { lockedEvmUsdcRecipient } from "../evm-pay.ts";
import {
  BASE_CAIP2,
  BASE_USDC,
  BASE_USDC_EIP712_NAME,
  BASE_USDC_EIP712_VERSION,
  BASE_X402_NETWORK,
  METER_X402_MAX_TIMEOUT_SEC,
  type MeterExactAccept,
} from "../meter/accepts.ts";
import type { MeterChainFinder } from "../meter/settle.ts";
import {
  exactEvmFailureBody,
  invoiceIdFromPayment,
  readX402Payment,
  referenceFromPayment,
  settleExactEvmPayment,
  type ExactEvmSettler,
} from "../meter/x402-evm.ts";
import { PAY_EXPIRY_MS, SOLANA_PAYOUT_ADDRESS, USDC_MINT, buildSolanaPayUrl, lockedSolanaUsdcRecipient } from "../solana-pay.ts";
import { json } from "../server/http.ts";
import {
  FEATURED_DAYS,
  FEATURED_HONESTY,
  FEATURED_LINE,
  FEATURED_PATH,
  FEATURED_PAY_LINE,
  FEATURED_PRICE_USD,
  FEATURED_SKU,
} from "./featured-copy.ts";
import {
  FEATURED_AMOUNT_BASE_UNITS,
  expireFeaturedOrder,
  featuredStillActive,
  featuredUntilForListing,
  getFeaturedOrder,
  grantFeatured,
  noteFeaturedUnderpaid,
  startFeaturedPay,
  type FeaturedOrder,
} from "./featured.ts";
import { ListingError, clientIp, hashClientIp, isUndefinedTable, type ListingQuery } from "./listings.ts";

export type FeaturedPayDeps = {
  findPayment?: MeterChainFinder;
  settleExactEvm?: ExactEvmSettler;
};

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function isSchemaMissing(err: unknown): boolean {
  if (isUndefinedTable(err)) return true;
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "42703" && /featured_until/i.test(message)) return true;
  return /agent_listing_featured_orders|featured_until/i.test(message) && /does not exist/i.test(message);
}

function acceptsFor(order: FeaturedOrder): MeterExactAccept[] {
  const extra = {
    sku: FEATURED_SKU,
    price_usd: FEATURED_PRICE_USD,
    invoice_id: order.id,
    reference: order.reference,
    listing_id: order.listing_id,
    symbol: "USDC",
    decimals: 6,
  };
  const base: MeterExactAccept = {
    scheme: "exact",
    network: BASE_X402_NETWORK,
    amount: order.amount_base_units,
    payTo: lockedEvmUsdcRecipient(),
    asset: BASE_USDC,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: {
      ...extra,
      name: BASE_USDC_EIP712_NAME,
      version: BASE_USDC_EIP712_VERSION,
      assetTransferMethod: "eip3009",
      caip2: BASE_CAIP2,
    },
  };
  const solana: MeterExactAccept = {
    scheme: "exact",
    network: "solana",
    amount: order.amount_base_units,
    payTo: lockedSolanaUsdcRecipient(),
    asset: USDC_MINT,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra: {
      ...extra,
      match: "solana-pay-reference",
    },
  };
  return [base, solana];
}

export function featuredInvoiceView(
  order: FeaturedOrder,
  featuredUntil: string | null,
  now: Date,
) {
  return {
    invoice_id: order.id,
    listing_id: order.listing_id,
    sku: FEATURED_SKU,
    price_usd: FEATURED_PRICE_USD,
    days: FEATURED_DAYS,
    amount_usd: FEATURED_PRICE_USD,
    amount_base_units: FEATURED_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    status: order.status,
    reference: order.reference,
    pay_to: lockedSolanaUsdcRecipient(),
    base_pay_to: lockedEvmUsdcRecipient(),
    pay_url: buildSolanaPayUrl({
      amountUsdc: FEATURED_PRICE_USD,
      reference: order.reference,
    }),
    accepts: acceptsFor(order),
    tx_ref: order.tx_ref,
    paid_at: order.paid_at,
    expires_at: order.expires_at,
    featured_until: featuredUntil,
    featured: featuredStillActive(featuredUntil, now),
    line: FEATURED_LINE,
    note: FEATURED_HONESTY,
    pay: FEATURED_PAY_LINE,
    watch_url: `https://agent-control.net${FEATURED_PATH}`,
  };
}

function pricingBody() {
  return {
    sku: FEATURED_SKU,
    price_usd: FEATURED_PRICE_USD,
    days: FEATURED_DAYS,
    amount_base_units: FEATURED_AMOUNT_BASE_UNITS,
    asset: "usdc" as const,
    pay_to: SOLANA_PAYOUT_ADDRESS,
    base_pay_to: lockedEvmUsdcRecipient(),
    chains: ["base", "solana"] as const,
    line: FEATURED_LINE,
    note: FEATURED_HONESTY,
    pay: FEATURED_PAY_LINE,
    endpoint: `POST ${FEATURED_PATH}`,
  };
}

function invoiceKey(body: Record<string, unknown>, payment: Record<string, unknown> | null): string {
  const fromPayment = payment
    ? invoiceIdFromPayment(payment) || referenceFromPayment(payment)
    : "";
  const fromBody = String(body.invoice_id ?? body.invoiceId ?? body.reference ?? "").trim();
  return (fromPayment || fromBody).slice(0, 120);
}

function isWatch(body: Record<string, unknown>, payment: Record<string, unknown> | null): boolean {
  return Boolean(invoiceKey(body, payment));
}

async function watchOrder(
  sql: ListingQuery,
  order: FeaturedOrder,
  request: Request,
  body: Record<string, unknown>,
  deps: FeaturedPayDeps,
  now: Date,
): Promise<Response> {
  if (order.status === "paid") {
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(featuredInvoiceView(order, until, now));
  }
  if (order.status === "expired") {
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(
      { ...featuredInvoiceView(order, until, now), error: "This payment window closed. Start again." },
      402,
    );
  }
  if (order.status === "underpaid") {
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(
      {
        ...featuredInvoiceView(order, until, now),
        error: "The payment was short of $19 USDC. Start again and pay the full $19.",
      },
      402,
    );
  }

  const payload = readX402Payment(request, body);
  if (payload) {
    const settled = await settleExactEvmPayment(
      payload,
      {
        invoice_id: order.id,
        reference: order.reference,
        amount_base_units: FEATURED_AMOUNT_BASE_UNITS,
        amount_usd: FEATURED_PRICE_USD,
        sku: FEATURED_SKU,
      },
      { settler: deps.settleExactEvm },
    );
    if (!settled.ok) return json(exactEvmFailureBody(settled), 400);
    const granted = await grantFeatured(sql, order.id, {
      chain: "base",
      txRef: settled.transaction,
      now,
    });
    const current = granted?.order ?? (await getFeaturedOrder(sql, order.id));
    const until = granted?.featured_until ?? (await featuredUntilForListing(sql, order.listing_id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    return json(featuredInvoiceView(current, until, now));
  }

  const finder: MeterChainFinder =
    deps.findPayment ??
    (async (opts) => {
      const { findMatchingUsdcPayment } = await import("../solana-pay.server.ts");
      return findMatchingUsdcPayment(opts);
    });
  let match: Awaited<ReturnType<MeterChainFinder>> = { kind: "none" };
  try {
    match = await finder({
      reference: order.reference,
      recipient: lockedSolanaUsdcRecipient(),
      amountUsdc: FEATURED_PRICE_USD,
    });
  } catch {
    match = { kind: "none" };
  }

  if (match.kind === "paid" && match.amountUsdc + 1e-9 >= FEATURED_PRICE_USD) {
    const granted = await grantFeatured(sql, order.id, {
      chain: "solana",
      txRef: match.signature,
      now,
    });
    const current = granted?.order ?? (await getFeaturedOrder(sql, order.id));
    const until = granted?.featured_until ?? (await featuredUntilForListing(sql, order.listing_id));
    if (!current) return json({ error: "Unknown payment." }, 404);
    return json(featuredInvoiceView(current, until, now));
  }

  if (match.kind === "underpaid" || (match.kind === "paid" && match.amountUsdc + 1e-9 < FEATURED_PRICE_USD)) {
    const noted = await noteFeaturedUnderpaid(sql, order.id, match.signature);
    const current = noted ?? order;
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(
      {
        ...featuredInvoiceView(current, until, now),
        error: "The payment was short of $19 USDC. Start again and pay the full $19.",
      },
      402,
    );
  }

  const opened = new Date(order.created_at).getTime();
  if (now.getTime() > opened + PAY_EXPIRY_MS) {
    const expired = (await expireFeaturedOrder(sql, order.id)) ?? order;
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(
      {
        ...featuredInvoiceView(expired, until, now),
        error: "This payment window closed. Start again.",
      },
      402,
    );
  }

  const until = await featuredUntilForListing(sql, order.listing_id);
  return json(featuredInvoiceView(order, until, now), 402);
}

export async function handleFeaturedRequest(
  request: Request,
  sql: ListingQuery,
  deps: FeaturedPayDeps = {},
  now = new Date(),
): Promise<Response> {
  try {
    if (request.method === "GET") return json(pricingBody());
    if (request.method !== "POST") return json({ error: "Use POST to start a featured payment." }, 405);

    let body: Record<string, unknown> = {};
    try {
      body = parseBody(await request.json());
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const payment = readX402Payment(request, body);
    if (isWatch(body, payment)) {
      const key = invoiceKey(body, payment);
      const order = await getFeaturedOrder(sql, key);
      if (!order) return json({ error: "Unknown payment." }, 404);
      return await watchOrder(sql, order, request, body, deps, now);
    }

    const order = await startFeaturedPay(sql, body, now, hashClientIp(clientIp(request.headers)));
    const until = await featuredUntilForListing(sql, order.listing_id);
    return json(featuredInvoiceView(order, until, now), 402);
  } catch (err) {
    if (isSchemaMissing(err)) return json({ error: "Featured payment is not available yet." }, 503);
    if (err instanceof ListingError) return json({ error: err.message }, err.status);
    console.error("[directory] featured failed", err instanceof Error ? err.name : "error");
    return json({ error: "Could not start featured payment." }, 500);
  }
}
