import { createHash, randomBytes } from "node:crypto";
import type { ListingQuery } from "../directory/listings.ts";
import { lockedEvmUsdcRecipient } from "../evm-pay.ts";
import { newPayReference } from "../pay-invoice.ts";
import { PAY_EXPIRY_MS, lockedSolanaUsdcRecipient, usdcBaseUnits } from "../solana-pay.ts";
import {
  X402_CHECK_DAYS,
  X402_CHECK_FREE_PER_HOUR,
  X402_CHECK_PRICE_USD,
  X402_CHECK_RUNS,
  X402_CHECK_SKU,
  X402_CHECK_STARTS_PER_HOUR,
} from "./copy.ts";
import { walletLooksValid } from "./checks.ts";
import { parsePublicHttpsUrl, SsrfError } from "./ssrf.ts";

export const X402_CHECK_AMOUNT_BASE_UNITS = usdcBaseUnits(X402_CHECK_PRICE_USD);
const RATE_WINDOW_MS = 60 * 60 * 1000;

export class X402CheckError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "X402CheckError";
    this.status = status;
  }
}

export class X402SchemaMissing extends Error {
  constructor() {
    super("x402 check table is missing");
    this.name = "X402SchemaMissing";
  }
}

export type X402Chain = "solana" | "base";
export type X402PayStatus = "pending" | "paid" | "underpaid" | "expired";
export type StoredTarget = { kind: "url" | "wallet"; value: string };

export type X402Order = {
  id: string;
  target: string;
  target_kind: "url" | "wallet";
  sku: typeof X402_CHECK_SKU;
  amount_usd: number;
  amount_base_units: string;
  chain: X402Chain | null;
  reference: string;
  pay_to: string;
  base_pay_to: string;
  tx_ref: string | null;
  status: X402PayStatus;
  paid_at: string | null;
  report_until: string | null;
  runs_used: number;
  report_json: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  target: string;
  target_kind: string;
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
  report_until: Date | string | null;
  runs_used: number | string;
  report_json: string | null;
  created_at: Date | string;
};

const ORDER_COLUMNS = `id, target, target_kind, sku, amount_usd, amount_base_units, chain, reference,
  pay_to, base_pay_to, tx_ref, status, paid_at, report_until, runs_used, report_json, created_at`;

const hits = new Map<string, number[]>();

export function hashCheckIp(ip: string): string {
  return createHash("sha256").update(`x402-check:${ip}`).digest("hex");
}

export function allowMemoryHit(key: string, limit: number, nowMs: number): boolean {
  const prev = (hits.get(key) ?? []).filter((at) => nowMs - at < RATE_WINDOW_MS);
  if (prev.length >= limit) {
    hits.set(key, prev);
    return false;
  }
  prev.push(nowMs);
  hits.set(key, prev);
  return true;
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new X402CheckError("Invalid timestamp", 500);
  return parsed.toISOString();
}

function asStatus(value: string): X402PayStatus {
  if (value === "pending" || value === "paid" || value === "underpaid" || value === "expired") return value;
  throw new X402CheckError("Could not read the payment.", 500);
}

function mapOrder(row: OrderRow): X402Order {
  const kind = row.target_kind === "wallet" ? "wallet" : "url";
  const chain = row.chain === "solana" || row.chain === "base" ? row.chain : null;
  return {
    id: row.id,
    target: row.target,
    target_kind: kind,
    sku: X402_CHECK_SKU,
    amount_usd: Number(row.amount_usd),
    amount_base_units: row.amount_base_units,
    chain,
    reference: row.reference,
    pay_to: lockedSolanaUsdcRecipient(row.pay_to),
    base_pay_to: lockedEvmUsdcRecipient(row.base_pay_to),
    tx_ref: row.tx_ref,
    status: asStatus(row.status),
    paid_at: row.paid_at ? iso(row.paid_at) : null,
    report_until: row.report_until ? iso(row.report_until) : null,
    runs_used: Number(row.runs_used),
    report_json: row.report_json,
    created_at: iso(row.created_at),
  };
}

export function isX402SchemaMissing(err: unknown): boolean {
  if (err instanceof X402SchemaMissing) return true;
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "42P01" && /x402_check_/i.test(message)) return true;
  return /x402_check_orders|x402_check_hits/i.test(message) && /does not exist/i.test(message);
}

function honeypotFilled(body: Record<string, unknown>): boolean {
  if (!("company_website" in body)) return false;
  const value = body.company_website;
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

export function parseCheckTarget(input: unknown): StoredTarget {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new X402CheckError("Paste an https endpoint or a payTo wallet.");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new X402CheckError("Could not run this check.");
  const urlRaw = typeof body.url === "string" ? body.url : typeof body.endpoint === "string" ? body.endpoint : "";
  const payRaw =
    typeof body.pay_to === "string" ? body.pay_to : typeof body.payTo === "string" ? body.payTo : "";
  const url = urlRaw.trim();
  const payTo = payRaw.trim();
  if (url) {
    try {
      const parsed = parsePublicHttpsUrl(url);
      return { kind: "url", value: parsed.href };
    } catch (err) {
      if (err instanceof SsrfError) throw new X402CheckError(err.message);
      throw new X402CheckError("Use a public https URL.");
    }
  }
  if (payTo) {
    if (!walletLooksValid(payTo)) throw new X402CheckError("That payTo is not a Base address or a Solana address.");
    return { kind: "wallet", value: payTo };
  }
  throw new X402CheckError("Paste an https endpoint or a payTo wallet.");
}

export async function allowDbHit(
  sql: ListingQuery,
  ipHash: string,
  kind: "free" | "report",
  limit: number,
  now: Date,
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from x402_check_hits
     where ip_hash = $1 and kind = $2 and created_at > $3`,
    [ipHash, kind, windowStart],
  );
  if (Number(counts[0]?.n ?? 0) >= limit) return false;
  await sql.query(
    `insert into x402_check_hits (ip_hash, kind, created_at) values ($1, $2, $3)`,
    [ipHash, kind, now],
  );
  return true;
}

export async function assertFreeRate(sql: ListingQuery | null, ipHash: string, now: Date): Promise<void> {
  const memoryKey = `${ipHash}:free`;
  if (!allowMemoryHit(memoryKey, X402_CHECK_FREE_PER_HOUR, now.getTime())) {
    throw new X402CheckError("Too many checks from this network. Try again later.", 429);
  }
  if (!sql) return;
  try {
    const ok = await allowDbHit(sql, ipHash, "free", X402_CHECK_FREE_PER_HOUR, now);
    if (!ok) throw new X402CheckError("Too many checks from this network. Try again later.", 429);
  } catch (err) {
    if (err instanceof X402CheckError) throw err;
    if (isX402SchemaMissing(err)) return;
    throw err;
  }
}

export async function getX402Order(sql: ListingQuery, key: string): Promise<X402Order | null> {
  const rows = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS} from x402_check_orders where id = $1 or reference = $1 limit 1`,
    [key],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function startX402Pay(
  sql: ListingQuery,
  target: StoredTarget,
  now: Date,
  ipHash: string,
): Promise<X402Order> {
  const openAfter = new Date(now.getTime() - PAY_EXPIRY_MS);
  const open = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS} from x402_check_orders
     where target = $1 and status = 'pending' and created_at > $2
     order by created_at desc
     limit 1`,
    [target.value, openAfter],
  );
  if (open[0]) return mapOrder(open[0]);

  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from x402_check_orders where ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  if (Number(counts[0]?.n ?? 0) >= X402_CHECK_STARTS_PER_HOUR) {
    throw new X402CheckError("Too many payment starts from this network. Try again later.", 429);
  }

  const id = `x402_${randomBytes(12).toString("hex")}`;
  const reference = newPayReference();
  const rows = await sql.query<OrderRow>(
    `insert into x402_check_orders (
       id, target, target_kind, sku, amount_usd, amount_base_units, reference,
       pay_to, base_pay_to, status, ip_hash, created_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
     returning ${ORDER_COLUMNS}`,
    [
      id,
      target.value,
      target.kind,
      X402_CHECK_SKU,
      X402_CHECK_PRICE_USD,
      X402_CHECK_AMOUNT_BASE_UNITS,
      reference,
      lockedSolanaUsdcRecipient(),
      lockedEvmUsdcRecipient(),
      ipHash,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new X402CheckError("Could not start this payment.", 500);
  return mapOrder(row);
}

export function reportUntilFrom(now: Date): Date {
  return new Date(now.getTime() + X402_CHECK_DAYS * 24 * 60 * 60 * 1000);
}

export async function grantX402Pay(
  sql: ListingQuery,
  orderId: string,
  opts: { chain: X402Chain; txRef: string; now: Date },
): Promise<X402Order | null> {
  const until = reportUntilFrom(opts.now);
  const rows = await sql.query<OrderRow>(
    `update x402_check_orders
     set status = 'paid', chain = $2, tx_ref = $3, paid_at = $4::timestamptz, report_until = $5::timestamptz
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, opts.chain, opts.txRef, opts.now, until],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function noteX402Underpaid(sql: ListingQuery, orderId: string, txRef: string): Promise<X402Order | null> {
  const rows = await sql.query<OrderRow>(
    `update x402_check_orders
     set status = 'underpaid', chain = 'solana', tx_ref = $2
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, txRef],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function expireX402Order(sql: ListingQuery, orderId: string): Promise<X402Order | null> {
  const rows = await sql.query<OrderRow>(
    `update x402_check_orders set status = 'expired' where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function saveX402Report(
  sql: ListingQuery,
  orderId: string,
  reportJson: string,
  runsUsed: number,
): Promise<X402Order | null> {
  const rows = await sql.query<OrderRow>(
    `update x402_check_orders
     set report_json = $2, runs_used = $3
     where id = $1 and status = 'paid' and runs_used < $3
     returning ${ORDER_COLUMNS}`,
    [orderId, reportJson, runsUsed],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export function recheckOpen(order: X402Order, now: Date): boolean {
  if (order.status !== "paid" || !order.report_until) return false;
  if (order.runs_used >= X402_CHECK_RUNS) return false;
  return new Date(order.report_until).getTime() > now.getTime();
}
