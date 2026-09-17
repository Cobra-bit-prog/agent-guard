/**
 * Base USDC EIP-3009 exact: verify + settle via public x402 endpoints (CDP, then PayAI).
 * Solana stays on the existing watch/Helius mint path.
 * We never take keys. Do not retarget payTo.
 */

import {
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
  | { ok: false; error: string };

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

function isValidVerify(body: Record<string, unknown>): boolean {
  if (body.isValid === true || body.valid === true || body.ok === true) return true;
  const nested = asRecord(body.result);
  return nested.isValid === true || nested.valid === true;
}

function isSettled(body: Record<string, unknown>): { transaction: string; payer: string } | null {
  const success = body.success === true || body.ok === true || asTrimmed(body.transaction).startsWith("0x");
  const transaction = asTrimmed(body.transaction ?? body.txHash ?? body.signature ?? asRecord(body.result).transaction);
  const payer = asTrimmed(body.payer ?? asRecord(body.result).payer);
  if (!success || !transaction) return null;
  return { transaction, payer };
}

export function requirementsForInvoice(invoice: MeterAcceptInvoice): MeterExactAccept {
  return meterBaseExactAccept(invoice);
}

export async function settleExactEvmPayment(
  payload: Record<string, unknown>,
  invoice: { amount_base_units: string; invoice_id?: string; reference?: string; sku?: string; amount_usd?: number },
  opts: { fetch?: JsonFetch; settler?: ExactEvmSettler } = {},
): Promise<ExactEvmSettleResult> {
  const checked = assertExactEvmAuthorization(payload, invoice);
  if (!checked.ok) return checked;
  const requirements = requirementsForInvoice(invoice);
  if (opts.settler) return opts.settler(payload, requirements);

  const fetchFn = opts.fetch ?? fetch;
  const body = {
    x402Version: 2,
    paymentPayload: payload,
    paymentRequirements: requirements,
  };
  let verified = false;
  for (const url of verifyUrls()) {
    const json = await postJson(url, body, fetchFn);
    if (json && isValidVerify(json)) {
      verified = true;
      break;
    }
  }
  if (!verified) return { ok: false, error: "Base USDC EIP-3009 payment was not valid." };

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
  }
  return { ok: false, error: "Base USDC EIP-3009 payment could not be settled." };
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
