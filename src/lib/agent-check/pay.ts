import { createHash, randomBytes } from "node:crypto";
import type { ListingQuery } from "../directory/listings.ts";
import { lockedEvmUsdcRecipient } from "../evm-pay.ts";
import { newPayReference } from "../pay-invoice.ts";
import { PAY_EXPIRY_MS, lockedSolanaUsdcRecipient, usdcBaseUnits } from "../solana-pay.ts";
import { allowMemoryHit } from "../x402-check/pay.ts";
import { parsePublicHttpsUrl, SsrfError } from "../x402-check/ssrf.ts";
import {
  AGENT_CHECK_DAYS,
  AGENT_CHECK_FREE_PER_HOUR,
  AGENT_CHECK_PRICE_USD,
  AGENT_CHECK_RUNS,
  AGENT_CHECK_SKU,
  AGENT_CHECK_STARTS_PER_HOUR,
} from "./copy.ts";

export const AGENT_CHECK_AMOUNT_BASE_UNITS = usdcBaseUnits(AGENT_CHECK_PRICE_USD);
const RATE_WINDOW_MS = 60 * 60 * 1000;

export class AgentCheckError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentCheckError";
    this.status = status;
  }
}

export class AgentSchemaMissing extends Error {
  constructor() {
    super("agent check table is missing");
    this.name = "AgentSchemaMissing";
  }
}

export type AgentChain = "solana" | "base";
export type AgentPayStatus = "pending" | "paid" | "underpaid" | "expired";

export type AgentOrder = {
  id: string;
  target: string;
  target_kind: "url";
  sku: typeof AGENT_CHECK_SKU;
  amount_usd: number;
  amount_base_units: string;
  chain: AgentChain | null;
  reference: string;
  pay_to: string;
  base_pay_to: string;
  tx_ref: string | null;
  status: AgentPayStatus;
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

export function hashAgentIp(ip: string): string {
  return createHash("sha256").update(`agent-check:${ip}`).digest("hex");
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AgentCheckError("Invalid timestamp", 500);
  return parsed.toISOString();
}

function asStatus(value: string): AgentPayStatus {
  if (value === "pending" || value === "paid" || value === "underpaid" || value === "expired") return value;
  throw new AgentCheckError("Could not read the payment.", 500);
}

function mapOrder(row: OrderRow): AgentOrder {
  const chain = row.chain === "solana" || row.chain === "base" ? row.chain : null;
  return {
    id: row.id,
    target: row.target,
    target_kind: "url",
    sku: AGENT_CHECK_SKU,
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

export function isAgentSchemaMissing(err: unknown): boolean {
  if (err instanceof AgentSchemaMissing) return true;
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code === "42P01" && /agent_check_/i.test(message)) return true;
  return /agent_check_orders|agent_check_hits/i.test(message) && /does not exist/i.test(message);
}

function honeypotFilled(body: Record<string, unknown>): boolean {
  if (!("company_website" in body)) return false;
  const value = body.company_website;
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

export function parseSiteUrl(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AgentCheckError("Paste the site's public https URL.");
  }
  const body = input as Record<string, unknown>;
  if (honeypotFilled(body)) throw new AgentCheckError("Could not run this check.");
  const raw = typeof body.url === "string" ? body.url : typeof body.site === "string" ? body.site : "";
  const text = raw.trim();
  if (!text) throw new AgentCheckError("Paste the site's public https URL.");
  try {
    return parsePublicHttpsUrl(text).origin;
  } catch (err) {
    if (err instanceof SsrfError) throw new AgentCheckError(err.message);
    throw new AgentCheckError("Use a public https URL.");
  }
}

export async function allowAgentDbHit(
  sql: ListingQuery,
  ipHash: string,
  kind: "free" | "report",
  limit: number,
  now: Date,
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from agent_check_hits
     where ip_hash = $1 and kind = $2 and created_at > $3`,
    [ipHash, kind, windowStart],
  );
  if (Number(counts[0]?.n ?? 0) >= limit) return false;
  await sql.query(
    `insert into agent_check_hits (ip_hash, kind, created_at) values ($1, $2, $3)`,
    [ipHash, kind, now],
  );
  return true;
}

export async function assertAgentFreeRate(sql: ListingQuery | null, ipHash: string, now: Date): Promise<void> {
  if (!allowMemoryHit(`agent:${ipHash}:free`, AGENT_CHECK_FREE_PER_HOUR, now.getTime())) {
    throw new AgentCheckError("Too many checks from this network. Try again later.", 429);
  }
  if (!sql) return;
  try {
    const ok = await allowAgentDbHit(sql, ipHash, "free", AGENT_CHECK_FREE_PER_HOUR, now);
    if (!ok) throw new AgentCheckError("Too many checks from this network. Try again later.", 429);
  } catch (err) {
    if (err instanceof AgentCheckError) throw err;
    if (isAgentSchemaMissing(err)) return;
    throw err;
  }
}

export async function getAgentOrder(sql: ListingQuery, key: string): Promise<AgentOrder | null> {
  const rows = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS} from agent_check_orders where id = $1 or reference = $1 limit 1`,
    [key],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function startAgentPay(sql: ListingQuery, target: string, now: Date, ipHash: string): Promise<AgentOrder> {
  const openAfter = new Date(now.getTime() - PAY_EXPIRY_MS);
  const open = await sql.query<OrderRow>(
    `select ${ORDER_COLUMNS} from agent_check_orders
     where target = $1 and status = 'pending' and created_at > $2
     order by created_at desc
     limit 1`,
    [target, openAfter],
  );
  if (open[0]) return mapOrder(open[0]);

  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  const counts = await sql.query<{ n: number | string }>(
    `select count(*)::int as n from agent_check_orders where ip_hash = $1 and created_at > $2`,
    [ipHash, windowStart],
  );
  if (Number(counts[0]?.n ?? 0) >= AGENT_CHECK_STARTS_PER_HOUR) {
    throw new AgentCheckError("Too many payment starts from this network. Try again later.", 429);
  }

  const id = `agent_${randomBytes(12).toString("hex")}`;
  const reference = newPayReference();
  const rows = await sql.query<OrderRow>(
    `insert into agent_check_orders (
       id, target, target_kind, sku, amount_usd, amount_base_units, reference,
       pay_to, base_pay_to, status, ip_hash, created_at
     ) values ($1, $2, 'url', $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
     returning ${ORDER_COLUMNS}`,
    [
      id,
      target,
      AGENT_CHECK_SKU,
      AGENT_CHECK_PRICE_USD,
      AGENT_CHECK_AMOUNT_BASE_UNITS,
      reference,
      lockedSolanaUsdcRecipient(),
      lockedEvmUsdcRecipient(),
      ipHash,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new AgentCheckError("Could not start this payment.", 500);
  return mapOrder(row);
}

export function reportUntilFrom(now: Date): Date {
  return new Date(now.getTime() + AGENT_CHECK_DAYS * 24 * 60 * 60 * 1000);
}

export async function grantAgentPay(
  sql: ListingQuery,
  orderId: string,
  opts: { chain: AgentChain; txRef: string; now: Date },
): Promise<AgentOrder | null> {
  const until = reportUntilFrom(opts.now);
  const rows = await sql.query<OrderRow>(
    `update agent_check_orders
     set status = 'paid', chain = $2, tx_ref = $3, paid_at = $4::timestamptz, report_until = $5::timestamptz
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, opts.chain, opts.txRef, opts.now, until],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function noteAgentUnderpaid(sql: ListingQuery, orderId: string, txRef: string): Promise<AgentOrder | null> {
  const rows = await sql.query<OrderRow>(
    `update agent_check_orders
     set status = 'underpaid', chain = 'solana', tx_ref = $2
     where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId, txRef],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function expireAgentOrder(sql: ListingQuery, orderId: string): Promise<AgentOrder | null> {
  const rows = await sql.query<OrderRow>(
    `update agent_check_orders set status = 'expired' where id = $1 and status = 'pending'
     returning ${ORDER_COLUMNS}`,
    [orderId],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export async function saveAgentReport(
  sql: ListingQuery,
  orderId: string,
  reportJson: string,
  runsUsed: number,
): Promise<AgentOrder | null> {
  const rows = await sql.query<OrderRow>(
    `update agent_check_orders
     set report_json = $2, runs_used = $3
     where id = $1 and status = 'paid' and runs_used < $3
     returning ${ORDER_COLUMNS}`,
    [orderId, reportJson, runsUsed],
  );
  const row = rows[0];
  return row ? mapOrder(row) : null;
}

export function recheckOpen(order: AgentOrder, now: Date): boolean {
  if (order.status !== "paid" || !order.report_until) return false;
  if (order.runs_used >= AGENT_CHECK_RUNS) return false;
  return new Date(order.report_until).getTime() > now.getTime();
}
