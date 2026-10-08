import { randomBytes } from "node:crypto";
import { newPayReference } from "../pay-invoice.ts";
import { PAY_EXPIRY_MS, lockedSolanaUsdcRecipient, usdcBaseUnits } from "../solana-pay.ts";
import { lockedEvmUsdcRecipient } from "../evm-pay.ts";
import {
  FEATURED_DAYS,
  FEATURED_PRICE_USD,
  FEATURED_SKU,
  FEATURED_STARTS_PER_HOUR,
} from "./featured-copy.ts";
import {
  HONEYPOT_FIELD,
  ListingError,
  RATE_WINDOW_MS,
  type ListingQuery,
} from "./listings.ts";

export const FEATURED_AMOUNT_BASE_UNITS = usdcBaseUnits(FEATURED_PRICE_USD);
export { FEATURED_STARTS_PER_HOUR };

const LISTING_ID = /^agent_[0-9a-f]{24}$/;

export type FeaturedChain = "solana" | "base";
export type FeaturedStatus = "pending" | "paid" | "underpaid" | "expired";

export type FeaturedOrder = {
  id: string;
  listing_id: string;
  sku: typeof FEATURED_SKU;
  amount_usd: number;
  amount_base_units: string;
  chain: FeaturedChain | null;
  reference: string;
  pay_to: string;
  base_pay_to: string;
  tx_ref: string | null;
  status: FeaturedStatus;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  listing_id: string;
  sku: string;
  amount_usd: number | string;
  amount_base_units: string;
  chain: string | null;
  reference: string;
  pay_to: string;
  base_pay_to: string;
  tx_ref: string | null;
  status: string;
  paid_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  featured_until?: Date | string | null;
};

const ORDER_COLUMNS = `id, listing_id, sku, amount_usd, amount_base_units, chain, reference,
  pay_to, base_pay_to, tx_ref, status, paid_at, expires_at, created_at`;

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ListingError("Invalid timestamp");
  return parsed.toISOString();
}

function asUsd(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new ListingError("Could not read the payment.", 500);
  return n;
}

function asChain(value: string | null): FeaturedChain | null {
  if (value === "solana" || value === "base") return value;
  return null;
}

function asStatus(value: string): FeaturedStatus {
  if (value === "pending" || value === "paid" || value === "underpaid" || value === "expired") {
    return value;
  }
  throw new ListingError("Could not read the payment.", 500);
}

function mapOrder(row: OrderRow): FeaturedOrder {
  return {
    id: row.id,
    listing_id: row.listing_id,
    sku: FEATURED_SKU,
    amount_usd: asUsd(row.amount_usd),
    amount_base_units: row.amount_base_units,
    chain: asChain(row.chain),
    reference: row.reference,
    pay_to: lockedSolanaUsdcRecipient(row.pay_to),
    base_pay_to: lockedEvmUsdcRecipient(row.base_pay_to),
    tx_ref: row.tx_ref,
    status: asStatus(row.status),
    paid_at: row.paid_at ? iso(row.paid_at) : null,
    expires_at: row.expires_at ? iso(row.expires_at) : null,
    created_at: iso(row.created_at),
  };
}

function honeypotFilled(body: Record<string, unknown>): boolean {
  if (!(HONEYPOT_FIELD in body)) return false;
  const value = body[HONEYPOT_FIELD];
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

function contactsMatch(stored: string, given: string): boolean {
  const left = stored.trim();
  const right = given.trim();
  if (!left || !right) return false;
  if (left.includes("@") || right.includes("@")) return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

export function featuredStillActive(featuredUntil: string | null, now: Date): boolean {
  if (!featuredUntil) return false;
  const at = new Date(featuredUntil).getTime();
  return Number.isFinite(at) && at > now.getTime();
}

export function parseFeaturedStart(input: unknown): { listingId: string; contact: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ListingError("Enter the listing id and the contact on that listing.");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new ListingError("Could not start this payment.");
  const listingId = typeof body.listing_id === "string" ? body.listing_id.trim() : "";
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  if (!listingId) throw new ListingError("Enter the listing id.");
  if (!LISTING_ID.test(listingId)) throw new ListingError("Enter the listing id from the directory.");
  if (!contact) throw new ListingError("Enter the contact on that listing.");
  if (contact.length > 200) throw new ListingError("Contact must be 200 characters or less");
  return { listingId, contact };
}

export async function getFeaturedOrder(sql: ListingQuery, key: string): Promise<FeaturedOrder | null> {
  const rows = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS}
     from agent_listing_featured_orders
     where id = $1 or reference = $1
     limit 1`,
    [key],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

async function readFeaturedUntil(sql: ListingQuery, listingId: string): Promise<string | null> {
  const rows = await sql.query<{ featured_until: Date | string | null }>(
    `select featured_until from agent_listings where id = $1`,
    [listingId],
  );
  const value = rows[0]?.featured_until;
  return value ? iso(value) : null;
}

export async function startFeaturedPay(
  sql: ListingQuery,
  input: unknown,
  now: Date,
  ipHash: string,
): Promise<FeaturedOrder> {
  const { listingId, contact } = parseFeaturedStart(input);
  const listings = await sql.query<{ id: string; contact: string }>(
    `select id, contact from agent_listings where id = $1 and hidden_at is null`,
    [listingId],
  );
  const listing = listings[0];
  if (!listing) throw new ListingError("That listing is not on the directory.", 404);
  if (!contactsMatch(listing.contact, contact)) {
    throw new ListingError("Contact does not match this listing.");
  }

  const openAfter = new Date(now.getTime() - PAY_EXPIRY_MS);
  const open = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS}
     from agent_listing_featured_orders
     where listing_id = $1 and status = 'pending' and created_at > $2
     order by created_at desc
     limit 1`,
    [listingId, openAfter],
  );
  if (open[0]) return mapOrder(open[0]);

  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n
     from agent_listing_featured_orders
     where ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  if (Number(counts[0]?.n ?? 0) >= FEATURED_STARTS_PER_HOUR) {
    throw new ListingError("Too many payment starts from this network. Try again later.", 429);
  }

  const id = `feat_${randomBytes(12).toString("hex")}`;
  const reference = newPayReference();
  const payTo = lockedSolanaUsdcRecipient();
  const basePayTo = lockedEvmUsdcRecipient();
  const rows = await sql.query<OrderRow>(
    `insert into agent_listing_featured_orders (
       id, listing_id, sku, amount_usd, amount_base_units, reference,
       pay_to, base_pay_to, status, ip_hash, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
     returning ${ORDER_COLUMNS}`,
    [
      id,
      listingId,
      FEATURED_SKU,
      FEATURED_PRICE_USD,
      FEATURED_AMOUNT_BASE_UNITS,
      reference,
      payTo,
      basePayTo,
      ipHash,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new ListingError("Could not start this payment.", 500);
  return mapOrder(row);
}

/**
 * Mark a pending order paid and pin the listing.
 * If it is already featured, add another 7 days after the current end.
 * A second call does not add days again.
 */
export async function grantFeatured(
  sql: ListingQuery,
  orderId: string,
  opts: { chain: FeaturedChain; txRef: string; now: Date },
): Promise<{ order: FeaturedOrder; featured_until: string } | null> {
  const paidRows = await sql.query<OrderRow>(
    `update agent_listing_featured_orders
     set status = 'paid',
         chain = $2,
         tx_ref = $3,
         paid_at = $4::timestamptz
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, opts.chain, opts.txRef, opts.now],
  );
  const paid = paidRows[0];
  if (!paid) return null;

  const slotRows = await sql.query<{ featured_until: Date | string }>(
    `update agent_listings
     set featured_until = greatest(
       coalesce(featured_until, $2::timestamptz),
       $2::timestamptz
     ) + ($3::int * interval '1 day')
     where id = $1
     returning featured_until`,
    [paid.listing_id, opts.now, FEATURED_DAYS],
  );
  const until = slotRows[0]?.featured_until;
  if (!until) return null;

  const finished = await sql.query<OrderRow>(
    `update agent_listing_featured_orders
     set expires_at = $2::timestamptz
     where id = $1
     returning ${ORDER_COLUMNS}`,
    [orderId, until],
  );
  const row = finished[0] ?? { ...paid, expires_at: until };
  return { order: mapOrder(row), featured_until: iso(until) };
}

export async function noteFeaturedUnderpaid(
  sql: ListingQuery,
  orderId: string,
  txRef: string,
): Promise<FeaturedOrder | null> {
  const rows = await sql.query<OrderRow>(
    `update agent_listing_featured_orders
     set status = 'underpaid', chain = 'solana', tx_ref = $2
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, txRef],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function expireFeaturedOrder(sql: ListingQuery, orderId: string): Promise<FeaturedOrder | null> {
  const rows = await sql.query<OrderRow>(
    `update agent_listing_featured_orders
     set status = 'expired'
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function featuredUntilForListing(
  sql: ListingQuery,
  listingId: string,
): Promise<string | null> {
  return readFeaturedUntil(sql, listingId);
}
