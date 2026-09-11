/**
 * Agent Meter auto-pay — agents pay themselves.
 * Copy this file. Separate from AgentKit / x402 (those call POST /api/v1/check).
 *
 * Flow: POST /meter/pass → 402 → USDC SPL transfer to pay_to WITH the Solana Pay
 * reference as an extra non-signer account → POST /meter/watch until token.
 * Then scan and preflight with X-Agent-Pass. No inbox. Meter never holds.
 *
 * Same transfer pattern as src/lib/pay-extension.ts (createTransferInstruction
 * + reference key). Node/TS. No Phantom.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type Signer,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

/** Locked Phantom receive wallet. Never change. Query strings cannot retarget funds. */
export const LOCKED_SOLANA_PAY_TO = "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR";
export const METER_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const DEFAULT_METER_SKU = "pass_1h";
export const DEFAULT_METER_ORIGIN = "https://agent-control.net";
export const DEFAULT_METER_RPC = "https://api.mainnet-beta.solana.com";
export const DEFAULT_PASS_USD = 0.25;
export const DEFAULT_PASS_BASE_UNITS = "250000";

export type MeterFetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

/** 402 JSON from POST /api/v1/meter/pass (and fields watch may echo). */
export type MeterPassInvoice = {
  invoice_id?: string;
  pay_to?: string;
  reference?: string;
  amount_usd?: number;
  amount_base_units?: string;
  pay_url?: string;
  sku?: string;
  token?: string;
  error?: string;
};

export type MeterPassPayment = {
  invoiceId: string;
  payTo: string;
  reference: string;
  amountUsd: number;
  amountBaseUnits: string;
};

export type MeterUsdcTransfer = {
  transaction: Transaction;
  instructions: TransactionInstruction[];
  payer: PublicKey;
  destOwner: PublicKey;
  sourceAta: PublicKey;
  destAta: PublicKey;
  reference: PublicKey;
  amount: bigint;
};

export type PayMeterPassOptions = {
  invoice: MeterPassInvoice;
  keypairOrSigner: Signer;
  rpcUrl?: string;
  connection?: Connection;
  sendTransaction?: (tx: Transaction, signer: Signer) => Promise<string>;
};

export type PayMeterPassResult = {
  signature: string;
  invoice_id: string;
};

export type BuyMeterPassOptions = {
  keypair: Signer;
  sku?: string;
  origin?: string;
  rpcUrl?: string;
  fetch?: MeterFetchLike;
  pay?: (opts: PayMeterPassOptions) => Promise<PayMeterPassResult>;
  watchAttempts?: number;
  watchDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type BuyMeterPassResult = {
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

function asPublicKey(value: PublicKey | string): PublicKey {
  return typeof value === "string" ? new PublicKey(value) : value;
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function originOf(raw?: string): string {
  return (raw ?? DEFAULT_METER_ORIGIN).replace(/\/+$/, "");
}

function rpcOf(raw?: string): string {
  const fromEnv =
    typeof process !== "undefined" ? String(process.env?.SOLANA_RPC_URL ?? "").trim() : "";
  return (raw ?? fromEnv ?? DEFAULT_METER_RPC).trim() || DEFAULT_METER_RPC;
}

function usdcBaseUnits(uiAmount: number): string {
  const micros = Math.round(Number(uiAmount) * 1_000_000);
  if (!Number.isFinite(micros) || micros < 0) return DEFAULT_PASS_BASE_UNITS;
  return String(micros);
}

function referenceFromPayUrl(payUrl: string): string {
  try {
    const text = payUrl.trim();
    const qIndex = text.indexOf("?");
    if (qIndex === -1) return "";
    const params = new URLSearchParams(text.slice(qIndex + 1));
    return (params.get("reference") ?? "").trim();
  } catch {
    return "";
  }
}

function amountUsdOf(invoice: MeterPassInvoice): number {
  const n = Number(invoice.amount_usd);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_PASS_USD;
}

/**
 * Refuse paying FROM the locked receive wallet.
 * That address is pay_to — it is not an agent payer.
 */
export function assertPayerIsNotReceiveWallet(payer: PublicKey | string): PublicKey {
  const payerKey = asPublicKey(payer);
  const receive = new PublicKey(LOCKED_SOLANA_PAY_TO);
  if (payerKey.equals(receive)) {
    throw new Error("Do not pay from the receive wallet. Use your agent wallet.");
  }
  return payerKey;
}

/** Always the locked payout address. Invoice pay_to cannot retarget funds. */
export function lockedMeterPayTo(_candidate?: string | null): string {
  return LOCKED_SOLANA_PAY_TO;
}

export function resolveMeterPassInvoice(invoice: MeterPassInvoice): MeterPassPayment {
  const invoiceId = asTrimmed(invoice.invoice_id);
  const reference = asTrimmed(invoice.reference) || referenceFromPayUrl(asTrimmed(invoice.pay_url));
  if (!reference) {
    throw new Error("Need a Solana Pay reference from the 402 invoice.");
  }
  const amountUsd = amountUsdOf(invoice);
  const amountBaseUnits = asTrimmed(invoice.amount_base_units) || usdcBaseUnits(amountUsd);
  return {
    invoiceId,
    payTo: lockedMeterPayTo(invoice.pay_to),
    reference,
    amountUsd,
    amountBaseUnits,
  };
}

/**
 * Build the USDC transfer: dest ATA (idempotent) + SPL transfer with the
 * Solana Pay reference as an extra non-signer, non-writable account.
 */
export function buildMeterUsdcTransfer(opts: {
  payer: PublicKey | string;
  reference: string;
  amountBaseUnits?: string;
  amountUsd?: number;
  payTo?: string;
}): MeterUsdcTransfer {
  const payer = assertPayerIsNotReceiveWallet(opts.payer);
  const destOwner = new PublicKey(lockedMeterPayTo(opts.payTo));
  const mint = new PublicKey(METER_USDC_MINT);
  const reference = new PublicKey(opts.reference);
  const amount = BigInt(
    opts.amountBaseUnits?.trim() || usdcBaseUnits(opts.amountUsd ?? DEFAULT_PASS_USD),
  );

  const sourceAta = getAssociatedTokenAddressSync(mint, payer);
  const destAta = getAssociatedTokenAddressSync(mint, destOwner);

  const transfer = createTransferInstruction(
    sourceAta,
    destAta,
    payer,
    amount,
    [],
    TOKEN_PROGRAM_ID,
  );
  transfer.keys.push({ pubkey: reference, isSigner: false, isWritable: false });

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(payer, destAta, destOwner, mint),
    transfer,
  ];
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = payer;
  return {
    transaction,
    instructions,
    payer,
    destOwner,
    sourceAta,
    destAta,
    reference,
    amount,
  };
}

/** Sign and send the 402 invoice as a Solana USDC transfer with reference. */
export async function payMeterPass(opts: PayMeterPassOptions): Promise<PayMeterPassResult> {
  const paid = resolveMeterPassInvoice(opts.invoice);
  const built = buildMeterUsdcTransfer({
    payer: opts.keypairOrSigner.publicKey,
    reference: paid.reference,
    amountBaseUnits: paid.amountBaseUnits,
    payTo: paid.payTo,
  });
  const send = opts.sendTransaction;
  if (send) {
    const signature = await send(built.transaction, opts.keypairOrSigner);
    if (!signature) throw new Error("Wallet did not return a signature.");
    return { signature, invoice_id: paid.invoiceId };
  }
  const connection = opts.connection ?? new Connection(rpcOf(opts.rpcUrl), "confirmed");
  const signature = await sendAndConfirmTransaction(
    connection,
    built.transaction,
    [opts.keypairOrSigner],
    { commitment: "confirmed" },
  );
  if (!signature) throw new Error("Wallet did not return a signature.");
  return { signature, invoice_id: paid.invoiceId };
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
    reference: asTrimmed(body.reference) || undefined,
    amount_usd: typeof body.amount_usd === "number" ? body.amount_usd : undefined,
    amount_base_units: asTrimmed(body.amount_base_units) || undefined,
    pay_url: asTrimmed(body.pay_url) || undefined,
    sku: asTrimmed(body.sku) || undefined,
    token: asTrimmed(body.token) || undefined,
    error: asTrimmed(body.error) || undefined,
  };
}

/**
 * End-to-end: invoice → agent wallet pays → watch until X-Agent-Pass token.
 * Default sku is pass_1h ($0.25).
 */
export async function buyMeterPass(opts: BuyMeterPassOptions): Promise<BuyMeterPassResult> {
  assertPayerIsNotReceiveWallet(opts.keypair.publicKey);
  const origin = originOf(opts.origin);
  const fetchFn = opts.fetch ?? fetch;
  const sku = asTrimmed(opts.sku);
  const passBody = sku && sku !== DEFAULT_METER_SKU ? { sku } : {};

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

  const pay = opts.pay ?? payMeterPass;
  const paid = await pay({
    invoice,
    keypairOrSigner: opts.keypair,
    rpcUrl: opts.rpcUrl,
  });

  const attempts = opts.watchAttempts ?? 30;
  const waitMs = opts.watchDelayMs ?? 2000;
  const sleep = opts.sleep ?? delay;
  let lastError = "Pass not ready. POST /api/v1/meter/watch with invoice_id again.";
  const invoiceId = paid.invoice_id || asTrimmed(invoice.invoice_id);
  if (!invoiceId) throw new Error("402 invoice is missing invoice_id.");

  for (let i = 0; i < attempts; i += 1) {
    const watchRes = await fetchFn(`${origin}/api/v1/meter/watch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId }),
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
