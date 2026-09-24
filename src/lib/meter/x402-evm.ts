/**
 * Base USDC EIP-3009 exact: verify + settle via public x402 endpoints (CDP, then PayAI).
 * Solana stays on the existing watch/Helius mint path.
 * We never take keys. Do not retarget payTo.
 */

import {
  BASE_CAIP2,
  BASE_USDC,
  BASE_X402_NETWORK,
  EVM_PAYOUT_ADDRESS,
  lockedEvmUsdcRecipient,
  meterBaseExactAccept,
  type MeterAcceptInvoice,
  type MeterExactAccept,
} from "./accepts.ts";

const CDP_VERIFY = "https://x402.org/facilitator/verify";
const CDP_SETTLE = "https://x402.org/facilitator/settle";
const PAYAI_VERIFY = "https://facilitator.payai.network/verify";
const PAYAI_SETTLE = "https://facilitator.payai.network/settle";

export type ExactEvmSettleResult =
  | { ok: true; transaction: string; payer: string }
  | { ok: false; error: string; invalidReason?: string; invalidMessage?: string };

export type ExactEvmSettler = (
  payload: Record<string, unknown>,
  requirements: MeterExactAccept,
) => Promise<ExactEvmSettleResult>;

export type Eip3009Authorization = {
  from: string;
  to: string;
  value: string;
  validAfter?: string;
  validBefore?: string;
  nonce?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decodeMaybeBase64Json(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
}

export function readX402Payment(request: Request, body: Record<string, unknown>): Record<string, unknown> | null {
  for (const name of ["PAYMENT-SIGNATURE", "PAYMENT", "X-PAYMENT"]) {
    const header = request.headers.get(name) ?? request.headers.get(name.toLowerCase());
    if (!header?.trim()) continue;
    const decoded = decodeMaybeBase64Json(header);
    const rec = asRecord(decoded);
    if (Object.keys(rec).length) return rec;
  }
  const direct = body.payment ?? body.paymentPayload ?? body.payment_payload;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return asRecord(direct);
  }
  const proof = asRecord(body.proof);
  const proofType = asTrimmed(proof.type).toLowerCase();
  if (proofType === "x402" || proofType === "eip3009" || proofType === "base") {
    const payload = proof.payload ?? proof.payment ?? proof.paymentPayload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) return asRecord(payload);
    if (proof.signature || proof.authorization) return proof;
  }
  return null;
}

export function eip3009AuthorizationOf(payload: Record<string, unknown>): Eip3009Authorization | null {
  const inner = asRecord(payload.payload);
  const auth = asRecord(inner.authorization ?? payload.authorization);
  const from = asTrimmed(auth.from);
  const to = asTrimmed(auth.to);
  const value = asTrimmed(auth.value);
  if (!from || !to || !value) return null;
  return {
    from,
    to,
    value,
    validAfter: asTrimmed(auth.validAfter) || undefined,
    validBefore: asTrimmed(auth.validBefore) || undefined,
    nonce: asTrimmed(auth.nonce) || undefined,
  };
}

export function eip3009SignatureOf(payload: Record<string, unknown>): string {
  const inner = asRecord(payload.payload);
  return asTrimmed(inner.signature ?? payload.signature);
}

export function invoiceIdFromPayment(payload: Record<string, unknown>): string {
  const accepted = asRecord(payload.accepted);
  const extra = asRecord(accepted.extra ?? payload.extra);
  return asTrimmed(extra.invoice_id ?? payload.invoice_id ?? extra.invoiceId);
}

export function referenceFromPayment(payload: Record<string, unknown>): string {
  const accepted = asRecord(payload.accepted);
  const extra = asRecord(accepted.extra ?? payload.extra);
  return asTrimmed(extra.reference ?? payload.reference);
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Reject retargeted or underpaid EIP-3009 authorizations before any remote call. */
export function assertExactEvmAuthorization(
  payload: Record<string, unknown>,
  invoice: { amount_base_units: string },
): { ok: true; authorization: Eip3009Authorization; signature: string } | { ok: false; error: string } {
  const authorization = eip3009AuthorizationOf(payload);
  const signature = eip3009SignatureOf(payload);
  if (!authorization) return { ok: false, error: "Provide an EIP-3009 exact payment payload." };
  if (!signature.startsWith("0x") || signature.length < 130) {
    return { ok: false, error: "Provide an EIP-3009 signature." };
  }
  if (!sameAddress(authorization.to, lockedEvmUsdcRecipient())) {
    return { ok: false, error: "payTo is locked." };
  }
  if (authorization.value !== invoice.amount_base_units) {
    return { ok: false, error: "Amount must match the invoice exactly." };
  }
  return { ok: true, authorization, signature };
}

function verifyUrls(): string[] {
  const override = process.env.METER_X402_VERIFY_URL?.trim();
  return override ? [override, PAYAI_VERIFY] : [CDP_VERIFY, PAYAI_VERIFY];
}

function settleUrls(): string[] {
  const override = process.env.METER_X402_SETTLE_URL?.trim();
  return override ? [override, PAYAI_SETTLE] : [CDP_SETTLE, PAYAI_SETTLE];
}

type JsonFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;

async function postJson(url: string, body: unknown, fetchFn: JsonFetch): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return null;
    return asRecord(json);
  } catch {
    return null;
  }
}

type BaseNetworkAlias = typeof BASE_X402_NETWORK | typeof BASE_CAIP2;

type VerifierDetail = { reason: string; message: string };

const EMPTY_VERIFIER_DETAIL: VerifierDetail = { reason: "", message: "" };

function isValidVerify(body: Record<string, unknown>): boolean {
  if (body.isValid === true || body.valid === true || body.ok === true) return true;
  const nested = asRecord(body.result);
  return nested.isValid === true || nested.valid === true;
}

function canonicalBaseNetwork(raw: string): BaseNetworkAlias | null {
  const network = raw.trim().toLowerCase();
  if (network === BASE_X402_NETWORK) return BASE_X402_NETWORK;
  if (network === BASE_CAIP2) return BASE_CAIP2;
  return null;
}

/** Network id the payer put on the signed envelope. `base` and `eip155:8453` are the same chain. */
function acceptedBaseNetwork(payload: Record<string, unknown>): BaseNetworkAlias | null {
  const accepted = asRecord(payload.accepted);
  return canonicalBaseNetwork(asTrimmed(accepted.network)) ?? canonicalBaseNetwork(asTrimmed(payload.network));
}

function withBaseNetwork(requirements: MeterExactAccept, network: BaseNetworkAlias): MeterExactAccept {
  if (requirements.network === network) return requirements;
  return { ...requirements, network };
}

function paymentForFacilitator(payload: Record<string, unknown>, requirements: MeterExactAccept): Record<string, unknown> {
  const accepted = asRecord(payload.accepted);
  const next: Record<string, unknown> = {
    ...payload,
    accepted: {
      ...accepted,
      scheme: requirements.scheme,
      network: requirements.network,
      payTo: requirements.payTo,
      asset: requirements.asset,
      maxAmountRequired: requirements.maxAmountRequired,
      amount: requirements.amount,
    },
  };
  if (typeof payload.network === "string") next.network = requirements.network;
  return next;
}

/** Drop signatures and credential-shaped text. Facilitator reasons are short codes. */
function sanitizeVerifierText(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (/api[_-]?key|private[_-]?key|secret[_-]?key|bearer\s+[a-z0-9._\-]+/i.test(trimmed)) return "";
  return trimmed.replace(/0x[a-fA-F0-9]{66,}/g, "[redacted]").slice(0, 180);
}

function readVerifierDetail(body: Record<string, unknown>): VerifierDetail {
  const nested = asRecord(body.result);
  const reason = sanitizeVerifierText(
    asTrimmed(body.invalidReason) ||
      asTrimmed(nested.invalidReason) ||
      asTrimmed(body.errorReason) ||
      asTrimmed(nested.errorReason) ||
      asTrimmed(body.reason) ||
      asTrimmed(nested.reason),
  );
  const message = sanitizeVerifierText(
    asTrimmed(body.invalidMessage) ||
      asTrimmed(nested.invalidMessage) ||
      asTrimmed(body.errorMessage) ||
      asTrimmed(nested.errorMessage) ||
      (typeof body.error === "string" ? body.error : "") ||
      (typeof nested.error === "string" ? nested.error : "") ||
      asTrimmed(body.message) ||
      asTrimmed(nested.message),
  );
  return { reason, message: message === reason ? "" : message };
}

function isNetworkAliasFailure(detail: VerifierDetail): boolean {
  const reason = detail.reason.toLowerCase();
  if (reason.includes("network")) return true;
  if (!reason && /network/i.test(detail.message)) return true;
  return false;
}

function verifierFailure(prefix: string, detail: VerifierDetail): ExactEvmSettleResult {
  const parts: string[] = [];
  if (detail.reason) parts.push(`invalidReason: ${detail.reason}`);
  if (detail.message) parts.push(`invalidMessage: ${detail.message}`);
  return {
    ok: false,
    error: parts.length ? `${prefix} ${parts.join(". ")}` : prefix,
    ...(detail.reason ? { invalidReason: detail.reason } : {}),
    ...(detail.message ? { invalidMessage: detail.message } : {}),
  };
}

export function exactEvmFailureBody(failure: {
  error: string;
  invalidReason?: string;
  invalidMessage?: string;
}): { error: string; invalidReason?: string; invalidMessage?: string } {
  return {
    error: failure.error,
    ...(failure.invalidReason ? { invalidReason: failure.invalidReason } : {}),
    ...(failure.invalidMessage ? { invalidMessage: failure.invalidMessage } : {}),
  };
}

function isSettled(body: Record<string, unknown>): { transaction: string; payer: string } | null {
  if (body.success === false || body.ok === false || body.isValid === false) return null;
  const success = body.success === true || body.ok === true || asTrimmed(body.transaction).startsWith("0x");
  const transaction = asTrimmed(body.transaction ?? body.txHash ?? body.signature ?? asRecord(body.result).transaction);
  const payer = asTrimmed(body.payer ?? asRecord(body.result).payer);
  if (!success || !transaction) return null;
  return { transaction, payer };
}

export function requirementsForInvoice(invoice: MeterAcceptInvoice): MeterExactAccept {
  return meterBaseExactAccept(invoice);
}

/**
 * PAYMENT-REQUIRED advertises Base as CAIP-2 (`eip155:8453`). The JSON 402 body
 * and the Base adapter still say `base`. x402 v2 facilitators compare those
 * strings and reject a mismatch. Match the id the payer accepted. If every
 * verifier rejects that id as a network-alias problem, try the other Base id
 * once. payTo, asset, and amount stay the locked invoice values.
 */
function baseNetworkAttempts(payload: Record<string, unknown>): BaseNetworkAlias[] {
  const preferred = acceptedBaseNetwork(payload) ?? BASE_X402_NETWORK;
  return preferred === BASE_CAIP2 ? [BASE_CAIP2, BASE_X402_NETWORK] : [BASE_X402_NETWORK, BASE_CAIP2];
}

async function verifyOnNetwork(
  payload: Record<string, unknown>,
  requirements: MeterExactAccept,
  fetchFn: JsonFetch,
): Promise<{ ok: true } | { ok: false; detail: VerifierDetail; networkFailure: boolean }> {
  let networkDetail = EMPTY_VERIFIER_DETAIL;
  let otherDetail = EMPTY_VERIFIER_DETAIL;
  for (const url of verifyUrls()) {
    const json = await postJson(
      url,
      { x402Version: 2, paymentPayload: payload, paymentRequirements: requirements },
      fetchFn,
    );
    if (!json) continue;
    if (isValidVerify(json)) return { ok: true };
    const detail = readVerifierDetail(json);
    if (!detail.reason && !detail.message) continue;
    if (isNetworkAliasFailure(detail)) networkDetail = detail;
    else otherDetail = detail;
  }
  const other = otherDetail.reason || otherDetail.message;
  return {
    ok: false,
    detail: other ? otherDetail : networkDetail,
    networkFailure: !other && Boolean(networkDetail.reason || networkDetail.message),
  };
}

export async function settleExactEvmPayment(
  payload: Record<string, unknown>,
  invoice: { amount_base_units: string; invoice_id?: string; reference?: string; sku?: string; amount_usd?: number },
  opts: { fetch?: JsonFetch; settler?: ExactEvmSettler } = {},
): Promise<ExactEvmSettleResult> {
  const checked = assertExactEvmAuthorization(payload, invoice);
  if (!checked.ok) return checked;
  const locked = requirementsForInvoice(invoice);
  const attempts = baseNetworkAttempts(payload);
  const firstNetwork = attempts[0] ?? BASE_X402_NETWORK;
  const firstRequirements = withBaseNetwork(locked, firstNetwork);
  const firstPayload = paymentForFacilitator(payload, firstRequirements);
  if (opts.settler) return opts.settler(firstPayload, firstRequirements);

  const fetchFn = opts.fetch ?? fetch;
  let failure = EMPTY_VERIFIER_DETAIL;
  for (let i = 0; i < attempts.length; i += 1) {
    const network = attempts[i] ?? BASE_X402_NETWORK;
    const requirements = withBaseNetwork(locked, network);
    const aligned = paymentForFacilitator(payload, requirements);
    const verified = await verifyOnNetwork(aligned, requirements, fetchFn);
    if (!verified.ok) {
      if (verified.detail.reason || verified.detail.message) failure = verified.detail;
      if (!verified.networkFailure) break;
      continue;
    }
    const body = {
      x402Version: 2,
      paymentPayload: aligned,
      paymentRequirements: requirements,
    };
    let settleDetail = EMPTY_VERIFIER_DETAIL;
    for (const url of settleUrls()) {
      const json = await postJson(url, body, fetchFn);
      if (!json) continue;
      const settled = isSettled(json);
      if (settled) {
        return {
          ok: true,
          transaction: settled.transaction,
          payer: settled.payer || checked.authorization.from,
        };
      }
      const detail = readVerifierDetail(json);
      if (detail.reason || detail.message) settleDetail = detail;
    }
    return verifierFailure("Base USDC EIP-3009 payment could not be settled.", settleDetail);
  }
  return verifierFailure("Base USDC EIP-3009 payment was not valid.", failure);
}

export function lockedBasePayTo(): string {
  return EVM_PAYOUT_ADDRESS;
}

export function isBaseExactPayload(payload: Record<string, unknown>): boolean {
  if (eip3009AuthorizationOf(payload) && eip3009SignatureOf(payload)) return true;
  const accepted = asRecord(payload.accepted);
  const network = asTrimmed(accepted.network ?? payload.network).toLowerCase();
  return network === BASE_X402_NETWORK || network === "eip155:8453" || asTrimmed(accepted.asset).toLowerCase() === BASE_USDC.toLowerCase();
}
