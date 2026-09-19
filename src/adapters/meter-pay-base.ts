/**
 * Agent Meter Base buyer — no Solana key.
 * Copy this file. Sign EIP-3009 exact on YOUR machine (CDP / AgentKit / viem).
 * We never take keys. payTo is locked.
 *
 * From a meter_buy_pass / 402 invoice already in hand:
 *   const { payment } = await payMeterPassBase({ invoice, from, signExact });
 *   // then meter_watch { invoice_id, payment } until token
 * CDP: signExact can be wallet.signTypedData(meterExactTypedData(authorization)).
 * Separate from AgentKit / x402 Human App adapters (those call POST /check).
 */

export const LOCKED_BASE_PAY_TO = "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98";
export const METER_BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const METER_BASE_CHAIN_ID = 8453;
export const METER_BASE_NETWORK = "base";
export const DEFAULT_METER_ORIGIN = "https://agent-control.net";
export const DEFAULT_PASS_BASE_UNITS = "200000";
export const DEFAULT_EXACT_TTL_SEC = 300;
export const METER_EXACT_PRIMARY_TYPE = "TransferWithAuthorization" as const;
export const METER_EXACT_EIP712_NAME = "USD Coin";
export const METER_EXACT_EIP712_VERSION = "2";
export const METER_EXACT_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type MeterFetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

export type MeterPassInvoice = {
  invoice_id?: string;
  pay_to?: string;
  base_pay_to?: string;
  reference?: string;
  amount_usd?: number;
  amount_base_units?: string;
  sku?: string;
  token?: string;
  error?: string;
};

export type MeterExactAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type SignMeterExact = (authorization: MeterExactAuthorization) => Promise<{
  authorization: MeterExactAuthorization;
  signature: string;
}>;

export type PayMeterPassBaseOptions = {
  invoice: MeterPassInvoice;
  from: string;
  signExact: SignMeterExact;
  nowSec?: number;
  nonce?: string;
};

export type PayMeterPassBaseResult = {
  payment: Record<string, unknown>;
  invoice_id: string;
  authorization: MeterExactAuthorization;
  signature: string;
};

export type BuyMeterPassBaseOptions = {
  from: string;
  signExact: SignMeterExact;
  sku?: string;
  origin?: string;
  fetch?: MeterFetchLike;
  pay?: (opts: PayMeterPassBaseOptions) => Promise<PayMeterPassBaseResult>;
  watchAttempts?: number;
  watchDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type BuyMeterPassBaseResult = {
  token: string;
  invoice_id: string;
  signature: string;
  pass_id?: string;
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

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function originOf(raw?: string): string {
  return (raw ?? DEFAULT_METER_ORIGIN).replace(/\/+$/, "");
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Always the locked Base payout. Invoice base_pay_to cannot retarget funds. */
export function lockedMeterBasePayTo(_candidate?: string | null): string {
  return LOCKED_BASE_PAY_TO;
}

/**
 * Refuse paying FROM the locked receive wallet.
 * That address is base_pay_to — it is not an agent payer.
 */
export function assertPayerIsNotBaseReceiveWallet(payer: string): string {
  const from = asTrimmed(payer);
  if (!from) throw new Error("Provide the Base payer address.");
  if (sameAddress(from, LOCKED_BASE_PAY_TO)) {
    throw new Error("Do not pay from the receive wallet. Use your agent wallet.");
  }
  return from;
}

/** EIP-712 typed data for CDP / AgentKit / viem signTypedData. payTo is locked. */
export function meterExactTypedData(authorization: MeterExactAuthorization) {
  return {
    domain: {
      name: METER_EXACT_EIP712_NAME,
      version: METER_EXACT_EIP712_VERSION,
      chainId: METER_BASE_CHAIN_ID,
      verifyingContract: METER_BASE_USDC,
    },
    types: METER_EXACT_TYPES,
    primaryType: METER_EXACT_PRIMARY_TYPE,
    message: {
      from: assertPayerIsNotBaseReceiveWallet(authorization.from),
      to: lockedMeterBasePayTo(authorization.to),
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce,
    },
  };
}

export function buildMeterExactAuthorization(opts: {
  from: string;
  amountBaseUnits?: string;
  validAfter?: string;
  validBefore?: string;
  nonce?: string;
  nowSec?: number;
}): MeterExactAuthorization {
  const from = assertPayerIsNotBaseReceiveWallet(opts.from);
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  return {
    from,
    to: lockedMeterBasePayTo(),
    value: asTrimmed(opts.amountBaseUnits) || DEFAULT_PASS_BASE_UNITS,
    validAfter: asTrimmed(opts.validAfter) || "0",
    validBefore: asTrimmed(opts.validBefore) || String(nowSec + DEFAULT_EXACT_TTL_SEC),
    nonce: asTrimmed(opts.nonce) || randomNonce(),
  };
}

export function buildMeterExactPayment(opts: {
  invoice: MeterPassInvoice;
  authorization: MeterExactAuthorization;
  signature: string;
}): Record<string, unknown> {
  const signature = asTrimmed(opts.signature);
  if (!signature.startsWith("0x") || signature.length < 130) {
    throw new Error("Provide an EIP-3009 signature.");
  }
  if (!sameAddress(opts.authorization.to, LOCKED_BASE_PAY_TO)) {
    throw new Error("payTo is locked.");
  }
  return {
    x402Version: 2,
    payload: {
      authorization: {
        from: opts.authorization.from,
        to: lockedMeterBasePayTo(opts.authorization.to),
        value: opts.authorization.value,
        validAfter: opts.authorization.validAfter,
        validBefore: opts.authorization.validBefore,
        nonce: opts.authorization.nonce,
      },
      signature,
    },
    accepted: {
      network: METER_BASE_NETWORK,
      extra: {
        invoice_id: asTrimmed(opts.invoice.invoice_id) || undefined,
        reference: asTrimmed(opts.invoice.reference) || undefined,
      },
    },
  };
}

/** Sign EIP-3009 exact to the locked base_pay_to. Caller supplies the signer. */
export async function payMeterPassBase(opts: PayMeterPassBaseOptions): Promise<PayMeterPassBaseResult> {
  const invoiceId = asTrimmed(opts.invoice.invoice_id);
  if (!invoiceId) throw new Error("402 invoice is missing invoice_id.");
  const amount = asTrimmed(opts.invoice.amount_base_units) || DEFAULT_PASS_BASE_UNITS;
  const drafted = buildMeterExactAuthorization({
    from: opts.from,
    amountBaseUnits: amount,
    nowSec: opts.nowSec,
    nonce: opts.nonce,
  });
  const signed = await opts.signExact(drafted);
  if (!sameAddress(signed.authorization.to, LOCKED_BASE_PAY_TO)) {
    throw new Error("payTo is locked.");
  }
  if (signed.authorization.value !== amount) {
    throw new Error("Amount must match the invoice exactly.");
  }
  const payment = buildMeterExactPayment({
    invoice: opts.invoice,
    authorization: {
      ...signed.authorization,
      to: lockedMeterBasePayTo(signed.authorization.to),
    },
    signature: signed.signature,
  });
  return {
    payment,
    invoice_id: invoiceId,
    authorization: signed.authorization,
    signature: asTrimmed(signed.signature),
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return asRecord(await res.json());
  } catch {
    return {};
  }
}

function invoiceFromBody(body: Record<string, unknown>): MeterPassInvoice {
  return {
    invoice_id: asTrimmed(body.invoice_id) || undefined,
    pay_to: asTrimmed(body.pay_to) || undefined,
    base_pay_to: asTrimmed(body.base_pay_to) || undefined,
    reference: asTrimmed(body.reference) || undefined,
    amount_usd: typeof body.amount_usd === "number" ? body.amount_usd : undefined,
    amount_base_units: asTrimmed(body.amount_base_units) || undefined,
    sku: asTrimmed(body.sku) || undefined,
    token: asTrimmed(body.token) || undefined,
    error: asTrimmed(body.error) || undefined,
  };
}

/**
 * End-to-end Base path: invoice → EIP-3009 exact → watch until X-Agent-Pass.
 * After free-5, omit sku to buy looks_20 pack → X-Agent-Pass.
 * No Solana key. We never take keys.
 */
export async function buyMeterPassBase(opts: BuyMeterPassBaseOptions): Promise<BuyMeterPassBaseResult> {
  assertPayerIsNotBaseReceiveWallet(opts.from);
  const origin = originOf(opts.origin);
  const fetchFn = opts.fetch ?? fetch;
  const sku = asTrimmed(opts.sku);
  const passBody = sku ? { sku } : {};

  const passRes = await fetchFn(`${origin}/api/v1/meter/pass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(passBody),
  });
  const passJson = await readJson(passRes);
  const invoice = invoiceFromBody(passJson);

  if (asTrimmed(invoice.token) && passRes.status === 200) {
    return {
      token: asTrimmed(invoice.token),
      invoice_id: asTrimmed(invoice.invoice_id),
      signature: "",
    };
  }
  if (passRes.status !== 402) {
    throw new Error(invoice.error || "Could not create a pass invoice.");
  }

  const pay = opts.pay ?? payMeterPassBase;
  const paid = await pay({
    invoice,
    from: opts.from,
    signExact: opts.signExact,
  });

  const attempts = opts.watchAttempts ?? 30;
  const waitMs = opts.watchDelayMs ?? 2000;
  const sleep = opts.sleep ?? delay;
  let lastError = "Pass not ready. POST /api/v1/meter/watch with invoice_id and payment again.";
  const invoiceId = paid.invoice_id || asTrimmed(invoice.invoice_id);
  if (!invoiceId) throw new Error("402 invoice is missing invoice_id.");

  for (let i = 0; i < attempts; i += 1) {
    const watchRes = await fetchFn(`${origin}/api/v1/meter/watch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId, payment: paid.payment }),
    });
    const watchJson = await readJson(watchRes);
    const token = asTrimmed(watchJson.token);
    if (token) {
      return {
        token,
        invoice_id: asTrimmed(watchJson.invoice_id) || invoiceId,
        signature: asTrimmed(watchJson.signature) || paid.signature,
        pass_id: asTrimmed(watchJson.pass_id) || undefined,
      };
    }
    lastError = asTrimmed(watchJson.error) || lastError;
    if (i < attempts - 1) await sleep(waitMs);
  }
  throw new Error(lastError);
}
