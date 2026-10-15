/**
 * Log who asked to pay, so real buyers can be told apart from probes.
 *
 * A row is written when a paid endpoint answers 402, or when a POST creates an
 * invoice or checkout that is not paid yet. We keep the user agent, a hash of
 * the IP (never the raw IP), the agent and client headers the caller sent, the
 * payer address if a payment header or query names one, the referer, the
 * route, and the sku.
 *
 * The write is cheap and can never break the response: errors are swallowed
 * and the wait is capped. Preview builds skip it, because they share the
 * production database.
 */
import { createHash } from "node:crypto";
import { clientIp } from "../directory/listings.ts";

export type PaymentAskKind = "payment_required" | "unpaid_checkout";

export type PaymentAsk = {
  kind: PaymentAskKind;
  route: string;
  method: string;
  status: number;
  sku: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  agent: string | null;
  client: string | null;
  wallet: string | null;
  referer: string | null;
};

export interface PaymentAskQuery {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export type PaymentAskOptions = {
  /** POST that creates an invoice or checkout. A 2xx reply that is not paid is logged. */
  createsCheckout?: boolean;
  env?: Record<string, string | undefined>;
  /** Longest we wait for the insert before returning the response anyway. */
  timeoutMs?: number;
};

const FIELD_MAX = 300;
const DEFAULT_TIMEOUT_MS = 250;
const AGENT_HEADERS = ["x-agent", "x-agent-id", "x-agent-name"];
const CLIENT_HEADERS = ["x-client", "x-client-id", "x-client-name", "x-mcp-client"];
const WALLET_HEADERS = ["x-wallet", "x-agent-wallet", "x-from"];
const PAYMENT_HEADERS = ["payment-signature", "payment", "x-payment"];
const WALLET_PARAMS = ["wallet", "from", "payer"];
const PAID = new Set(["paid", "complete", "completed", "succeeded"]);

export function hashAskIp(ip: string): string {
  return createHash("sha256").update(`payment-ask:${ip}`).digest("hex");
}

function clip(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, FIELD_MAX);
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = clip(headers.get(name));
    if (value) return value;
  }
  return null;
}

/** The payer address inside an x402 payment header (plain or base64 JSON). Never the signature. */
function payerFromPaymentHeader(raw: string): string | null {
  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(text, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const payload = (parsed.payload ?? parsed) as Record<string, unknown>;
    const auth = (payload.authorization ?? {}) as Record<string, unknown>;
    const from = auth.from ?? payload.from;
    return typeof from === "string" ? clip(from) : null;
  } catch {
    return null;
  }
}

function walletOf(request: Request): string | null {
  const header = firstHeader(request.headers, WALLET_HEADERS);
  if (header) return header;
  for (const name of PAYMENT_HEADERS) {
    const raw = request.headers.get(name);
    if (raw) {
      const payer = payerFromPaymentHeader(raw);
      if (payer) return payer;
    }
  }
  const url = new URL(request.url);
  for (const name of WALLET_PARAMS) {
    const value = clip(url.searchParams.get(name));
    if (value) return value;
  }
  return null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? clip(value) : null;
}

function skuOf(body: Record<string, unknown>): string | null {
  const nested = ["invoice", "order", "checkout", "result"]
    .map((key) => body[key])
    .filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  for (const source of [body, ...nested]) {
    const sku = stringField(source.sku) ?? stringField(source.plan) ?? stringField(source.product);
    if (sku) return sku;
  }
  return null;
}

function statusOf(body: Record<string, unknown>): string | null {
  for (const source of [body, body.invoice, body.order, body.checkout, body.result]) {
    if (source && typeof source === "object") {
      const status = stringField((source as Record<string, unknown>).status);
      if (status) return status.toLowerCase();
    }
  }
  return null;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.clone().json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The row to log for this request and response, or null when nothing should be logged. */
export async function paymentAskFor(
  request: Request,
  response: Response,
  route: string,
  options: PaymentAskOptions = {},
): Promise<PaymentAsk | null> {
  const method = request.method.toUpperCase();
  let kind: PaymentAskKind | null = null;
  let body: Record<string, unknown> = {};
  if (response.status === 402) {
    kind = "payment_required";
    body = await bodyOf(response);
  } else if (options.createsCheckout && method === "POST" && response.ok) {
    body = await bodyOf(response);
    const status = statusOf(body);
    if (!status || !PAID.has(status)) kind = "unpaid_checkout";
  }
  if (!kind) return null;
  const ip = clientIp(request.headers);
  return {
    kind,
    route,
    method,
    status: response.status,
    sku: skuOf(body),
    ip_hash: ip && ip !== "unknown" ? hashAskIp(ip) : null,
    user_agent: clip(request.headers.get("user-agent")),
    agent: firstHeader(request.headers, AGENT_HEADERS),
    client: firstHeader(request.headers, CLIENT_HEADERS),
    wallet: walletOf(request),
    referer: clip(request.headers.get("referer")),
  };
}

export async function insertPaymentAsk(sql: PaymentAskQuery, ask: PaymentAsk): Promise<void> {
  await sql.query(
    `insert into payment_asks
       (kind, route, method, status, sku, ip_hash, user_agent, agent, client, wallet, referer)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      ask.kind,
      ask.route,
      ask.method,
      ask.status,
      ask.sku,
      ask.ip_hash,
      ask.user_agent,
      ask.agent,
      ask.client,
      ask.wallet,
      ask.referer,
    ],
  );
}

/**
 * Log the ask if there is one, then hand back the same response.
 * Never throws and never waits longer than timeoutMs.
 */
export async function logPaymentAsk(
  request: Request,
  response: Response,
  route: string,
  getSql: () => Promise<PaymentAskQuery>,
  options: PaymentAskOptions = {},
): Promise<Response> {
  const env = options.env ?? process.env;
  if (env.VERCEL_ENV === "preview") return response;
  const write = (async () => {
    const ask = await paymentAskFor(request, response, route, options);
    if (!ask) return;
    await insertPaymentAsk(await getSql(), ask);
  })().catch((err: unknown) => {
    console.warn("[payment-ask] log skipped", err instanceof Error ? err.name : "error");
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  await Promise.race([write, cap]);
  if (timer) clearTimeout(timer);
  return response;
}
