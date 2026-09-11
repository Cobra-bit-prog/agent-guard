import { createHmac } from "node:crypto";
import { parsePartnerSlug, partnerSlugFromSearchParams } from "../partner.ts";

/**
 * Invoice mint paths. Extend only when a real creator is added.
 * `smoke` is health/probe traffic, not agent conversion intent.
 */
export const METER_INVOICE_SOURCES = [
  "http_pass",
  "http_watch",
  "http_scan",
  "http_preflight",
  "http_scan_batch",
  "http_stamp",
  "mcp_buy_pass",
  "smoke",
] as const;

export type MeterInvoiceSource = (typeof METER_INVOICE_SOURCES)[number];

export type MeterInvoiceOrigin = {
  source: MeterInvoiceSource | null;
  user_agent: string | null;
  cf_connecting_ip_hash: string | null;
  x_forwarded_for_hash: string | null;
  partner: string | null;
};

export type MeterInvoiceCreateOrigin = {
  source: MeterInvoiceSource;
  user_agent?: string | null;
  cf_connecting_ip_hash?: string | null;
  x_forwarded_for_hash?: string | null;
  partner?: string | null;
};

export const METER_USER_AGENT_MAX = 256;
export const METER_INVOICE_LIST_LIMIT = 200;

export function blankInvoiceOrigin(): MeterInvoiceOrigin {
  return {
    source: null,
    user_agent: null,
    cf_connecting_ip_hash: null,
    x_forwarded_for_hash: null,
    partner: null,
  };
}

export function isMeterInvoiceSource(value: unknown): value is MeterInvoiceSource {
  return typeof value === "string" && (METER_INVOICE_SOURCES as readonly string[]).includes(value);
}

export function isMeterSmokeSource(value: unknown): boolean {
  return value === "smoke";
}

const TRUTHY_SMOKE_FLAG = new Set(["1", "true", "yes", "smoke"]);

/** Body `{"source":"smoke"}` or `X-Meter-Smoke: 1` — health probes only. Never lets a client pick mcp_buy_pass. */
export function isExplicitMeterSmoke(request: Request, body: Record<string, unknown> = {}): boolean {
  if (body.source === "smoke") return true;
  const header = (request.headers.get("x-meter-smoke") ?? "").trim().toLowerCase();
  return TRUTHY_SMOKE_FLAG.has(header);
}

/**
 * Browser, Phantom, and MCP agent clients are never auto-classified as smoke.
 * Explicit `source=smoke` / `X-Meter-Smoke` still wins.
 */
const REAL_CLIENT_UA =
  /mozilla\/|phantom\/|chrome\/|safari\/|firefox\/|edg\/|mcp-inspector|modelcontextprotocol/i;

/**
 * Conservative bot UAs: curl, python-requests, httpx, and CoS/meter health probes.
 * Do not match Node fetch / undici — that is the real meter-pay adapter path.
 */
export function isSmokeUserAgent(value: string | null | undefined): boolean {
  const ua = (value ?? "").trim();
  if (!ua) return false;
  if (REAL_CLIENT_UA.test(ua)) return false;
  if (/^(curl|wget|httpie)\//i.test(ua)) return true;
  if (/^(python-requests|python-httpx|python-urllib|httpx|aiohttp)\//i.test(ua)) return true;
  if (/^cos\//i.test(ua)) return true;
  if (
    /\b(?:cos[-_]?health|cursor[-_]?cos|agent[-_]?guard[-_]?health|meter[-_]?(?:health|smoke))\b/i.test(
      ua,
    )
  ) {
    return true;
  }
  return false;
}

export function resolveMeterInvoiceSource(
  pathSource: MeterInvoiceSource,
  request: Request,
  body: Record<string, unknown> = {},
): MeterInvoiceSource {
  if (isExplicitMeterSmoke(request, body)) return "smoke";
  if (isSmokeUserAgent(request.headers.get("user-agent"))) return "smoke";
  return pathSource;
}

/**
 * HMAC key for client IP hashes on meter invoices.
 * Reuses INTERNAL_STATS_SECRET (already required for GET /api/v1/meter/report).
 * Optional METER_IP_HASH_SECRET is a local/dev fallback only — do not add it
 * on Vercel unless Admin/CoS sets it. Never store plaintext IPs.
 */
export function meterIpHashSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const reuse = env.INTERNAL_STATS_SECRET?.trim();
  if (reuse) return reuse;
  const dedicated = env.METER_IP_HASH_SECRET?.trim();
  return dedicated || null;
}

export function firstHopIp(header: string | null | undefined): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

export function hashMeterClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function hashHeaderIp(header: string | null | undefined, secret: string | null): string | null {
  const ip = firstHopIp(header);
  if (!ip || !secret) return null;
  return hashMeterClientIp(ip, secret);
}

export function truncateUserAgent(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, METER_USER_AGENT_MAX);
}

/** Meter-only partner slug from ?partner= or JSON body. Ignores Human App cookies. */
export function meterPartnerSlug(
  request: Request,
  body?: Record<string, unknown>,
): string | null {
  try {
    const fromQuery = partnerSlugFromSearchParams(new URL(request.url).searchParams);
    if (fromQuery) return fromQuery;
  } catch {
    /* invalid URL */
  }
  return parsePartnerSlug(body?.partner);
}

export function extractMeterInvoiceOrigin(
  request: Request,
  source: MeterInvoiceSource,
  body: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env,
): MeterInvoiceCreateOrigin {
  const secret = meterIpHashSecret(env);
  return {
    source: resolveMeterInvoiceSource(source, request, body),
    user_agent: truncateUserAgent(request.headers.get("user-agent")),
    cf_connecting_ip_hash: hashHeaderIp(request.headers.get("cf-connecting-ip"), secret),
    x_forwarded_for_hash: hashHeaderIp(request.headers.get("x-forwarded-for"), secret),
    partner: meterPartnerSlug(request, body),
  };
}

export function applyInvoiceOrigin(
  origin?: MeterInvoiceCreateOrigin | null,
): MeterInvoiceOrigin {
  if (!origin) return blankInvoiceOrigin();
  return {
    source: origin.source,
    user_agent: origin.user_agent ?? null,
    cf_connecting_ip_hash: origin.cf_connecting_ip_hash ?? null,
    x_forwarded_for_hash: origin.x_forwarded_for_hash ?? null,
    partner: origin.partner ?? null,
  };
}

export function invoiceSourceForMeterPath(
  suffix: string,
  override?: MeterInvoiceSource,
): MeterInvoiceSource {
  if (override) return override;
  if (suffix === "watch") return "http_watch";
  if (suffix === "scan") return "http_scan";
  if (suffix === "preflight") return "http_preflight";
  if (suffix === "scan-batch" || suffix === "scan_batch") return "http_scan_batch";
  if (suffix === "stamp") return "http_stamp";
  return "http_pass";
}

export function meterInvoiceSourceForMcpTool(name: string): MeterInvoiceSource | undefined {
  if (name === "meter_buy_pass") return "mcp_buy_pass";
  return undefined;
}

export function parseInvoiceSince(value: string | null): Date | null | "invalid" {
  if (value == null || value.trim() === "") return null;
  const raw = value.trim();
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return "invalid";
    const ms = n > 0 && n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "invalid" : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function isMeterInvoiceStatus(
  value: string,
): value is "pending" | "paid" | "expired" | "underpaid" {
  return value === "pending" || value === "paid" || value === "expired" || value === "underpaid";
}

export function internalInvoiceListView(invoice: {
  invoice_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  source: MeterInvoiceSource | null;
  user_agent: string | null;
  cf_connecting_ip_hash: string | null;
  x_forwarded_for_hash: string | null;
  partner: string | null;
  amount_usd: number;
}) {
  return {
    invoice_id: invoice.invoice_id,
    status: invoice.status,
    created_at: invoice.created_at,
    expires_at: invoice.expires_at,
    source: invoice.source,
    user_agent: invoice.user_agent,
    cf_connecting_ip_hash: invoice.cf_connecting_ip_hash,
    x_forwarded_for_hash: invoice.x_forwarded_for_hash,
    partner: invoice.partner,
    amount_usd: invoice.amount_usd,
  };
}
