/**
 * Merchant stamp gate. Copy this file.
 * https://agent-control.net/stamp.txt
 * Take this ticket or we do not take your USDC.
 * Merchants can require the stamp_tx $0.05 ticket before accepting agent USDC.
 *
 * Header X-Stamp-Id. Verify GET /api/v1/meter/stamp/:id.
 * Allow only if verified is true and decision is allow.
 * Else 402. Buy stamp_tx $0.05. No email. No API key. We never take keys.
 *
 * const gate = await requireMerchantStamp(request);
 * if (!gate.ok) return Response.json(gate.body, { status: gate.status });
 */

export const STAMP_ID_HEADER = "X-Stamp-Id";
export const DEFAULT_METER_ORIGIN = "https://agent-control.net";
export const STAMP_TX_SKU = "stamp_tx" as const;
export const STAMP_TX_PRICE_USD = 0.05;
export const STAMP_TICKET = "Take this ticket or we do not take your USDC.";
export const STAMP_MERCHANT =
  "Merchants can require the stamp_tx $0.05 ticket before accepting agent USDC.";

export type StampFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<Response>;

export type StampGateReason = "missing" | "unknown" | "invalid" | "stop" | "expired";

export type StampView = {
  verified?: unknown;
  decision?: unknown;
  expires_at?: unknown;
  stamp_id?: unknown;
};

export type MerchantStampAllow = {
  ok: true;
  stamp_id: string;
  decision: "allow";
};

export type MerchantStampRequired = {
  error: "payment_required";
  http: 402;
  ok: false;
  gate: "demo";
  reason: StampGateReason;
  sku: typeof STAMP_TX_SKU;
  price_usd: typeof STAMP_TX_PRICE_USD;
  asset: "usdc";
  ticket: typeof STAMP_TICKET;
  merchant: typeof STAMP_MERCHANT;
  header: typeof STAMP_ID_HEADER;
  pricing: string;
  stamp_txt: string;
  buy: string;
  buy_body: { sku: typeof STAMP_TX_SKU };
  mint: string;
  verify: string;
  next: string;
};

export type MerchantStampDeny = {
  ok: false;
  status: 402;
  body: MerchantStampRequired;
};

export function merchantStampRequiredBody(reason: StampGateReason): MerchantStampRequired {
  const origin = DEFAULT_METER_ORIGIN;
  return {
    error: "payment_required",
    http: 402,
    ok: false,
    gate: "demo",
    reason,
    sku: STAMP_TX_SKU,
    price_usd: STAMP_TX_PRICE_USD,
    asset: "usdc",
    ticket: STAMP_TICKET,
    merchant: STAMP_MERCHANT,
    header: STAMP_ID_HEADER,
    pricing: `${origin}/api/v1/meter/pricing`,
    stamp_txt: `${origin}/stamp.txt`,
    buy: `POST ${origin}/api/v1/meter/pass`,
    buy_body: { sku: STAMP_TX_SKU },
    mint: `POST ${origin}/api/v1/meter/stamp`,
    verify: `GET ${origin}/api/v1/meter/stamp/:id`,
    next: `Buy stamp_tx $0.05 via POST /api/v1/meter/pass {"sku":"stamp_tx"}. Mint an allow stamp via POST /api/v1/meter/stamp with X-Agent-Pass. Retry with header ${STAMP_ID_HEADER}. ${STAMP_TICKET}`,
  };
}

export function readMerchantStampId(request: Request): string {
  return (request.headers.get(STAMP_ID_HEADER) ?? "").trim();
}

function stampExpired(expires: unknown, nowMs: number): boolean {
  if (expires == null || expires === "") return false;
  const ms = typeof expires === "number" ? expires : Date.parse(String(expires));
  if (!Number.isFinite(ms)) return false;
  return ms <= nowMs;
}

/** Allow only when verify says verified and decision allow. Expired allow is not allow. */
export function stampViewAllows(
  view: StampView | null | undefined,
  nowMs = Date.now(),
): "allow" | "invalid" | "stop" | "expired" {
  if (!view || view.verified !== true) return "invalid";
  if (stampExpired(view.expires_at, nowMs)) return "expired";
  if (view.decision === "allow") return "allow";
  return "stop";
}

export async function verifyMerchantStamp(
  stampId: string,
  opts: { origin?: string; fetch?: StampFetch; nowMs?: number } = {},
): Promise<{ state: "allow"; stamp_id: string } | { state: Exclude<StampGateReason, "missing"> }> {
  const origin = (opts.origin ?? DEFAULT_METER_ORIGIN).replace(/\/$/, "");
  const fetchImpl = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${origin}/api/v1/meter/stamp/${encodeURIComponent(stampId)}`, {
      method: "GET",
    });
  } catch {
    return { state: "unknown" };
  }
  if (res.status === 404 || !res.ok) return { state: "unknown" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "invalid" };
  }
  if (!body || typeof body !== "object") return { state: "invalid" };
  const view = body as StampView;
  const state = stampViewAllows(view, opts.nowMs);
  if (state === "allow") {
    const stamp_id = typeof view.stamp_id === "string" && view.stamp_id.trim() ? view.stamp_id.trim() : stampId;
    return { state: "allow", stamp_id };
  }
  return { state };
}

export async function requireMerchantStamp(
  request: Request,
  opts: { origin?: string; fetch?: StampFetch; nowMs?: number } = {},
): Promise<MerchantStampAllow | MerchantStampDeny> {
  const stampId = readMerchantStampId(request);
  if (!stampId) return { ok: false, status: 402, body: merchantStampRequiredBody("missing") };
  const verdict = await verifyMerchantStamp(stampId, opts);
  if (verdict.state === "allow") {
    return { ok: true, stamp_id: verdict.stamp_id, decision: "allow" };
  }
  return { ok: false, status: 402, body: merchantStampRequiredBody(verdict.state) };
}
