/** Customer copy and the locked featured_7d price. No new payout wallet. */

export const FEATURED_SKU = "featured_7d" as const;
export const FEATURED_PRICE_USD = 19;
export const FEATURED_DAYS = 7;
/** Payment starts allowed from one IP hash per hour. */
export const FEATURED_STARTS_PER_HOUR = 8;

export const FEATURED_LINE =
  "Listing is free. Pay $19 to pin your agent at the top for 7 days.";
export const FEATURED_HONESTY = "We keep the fee. You pay us directly in USDC.";
export const FEATURED_PAY_LINE = "Pay on Base or Solana.";
export const FEATURED_CTA = "Feature this listing — $19 USDC / 7 days";
export const FEATURED_UPSELL = "Feature it for $19";
export const FEATURED_PATH = "/api/v1/agents/listings/featured";
