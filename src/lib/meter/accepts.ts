/**
 * Dual-rail Meter payment accepts: Base USDC (EIP-3009 exact) + Solana USDC.
 * Payouts are locked constants. Query strings cannot retarget funds.
 */

import { EVM_PAYOUT_ADDRESS, EVM_USDC, lockedEvmUsdcRecipient } from "../evm-pay.ts";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT, lockedSolanaUsdcRecipient } from "../solana-pay.ts";

export const BASE_USDC = EVM_USDC.base.usdc;
export const BASE_USDC_EIP712_NAME = "USD Coin";
export const BASE_USDC_EIP712_VERSION = "2";
/** AgentKit / CDP v1 network id. CAIP-2 is extra.caip2. JSON 402 body keeps these. */
export const BASE_X402_NETWORK = "base";
export const BASE_CAIP2 = "eip155:8453";
/** CDP Facilitator / x402 v2 Solana mainnet. PAYMENT-REQUIRED header uses this. */
export const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const METER_X402_MAX_TIMEOUT_SEC = 300;

export { EVM_PAYOUT_ADDRESS, lockedEvmUsdcRecipient };

const LOOK_QUESTION = "Can I pay this address?";
const LOOK_SKU = "look";
const LOOK_USD = 0.1;
const LOOK_AMOUNT = "100000";
/** Empty POST /meter/pass door. Well-known primary accept must match this amount. */
const LOOKS_20_SKU = "looks_20";
const LOOKS_20_USD = 0.2;
const LOOKS_20_AMOUNT = "200000";

/** x402 v2 exact accept. `amount` only — v1 `maxAmountRequired` makes facilitators reject v2. */
export type MeterExactAccept = {
  scheme: "exact";
  network: string;
  amount: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type MeterAcceptInvoice = {
  invoice_id?: string;
  reference?: string;
  amount_base_units?: string;
  sku?: string;
  amount_usd?: number;
};

export type MeterAcceptSku = {
  id: string;
  price_usd: number;
  amount_base_units: string;
};

function catalogOf(invoice?: MeterAcceptInvoice, sku?: MeterAcceptSku): MeterAcceptSku {
  if (sku) return sku;
  return {
    id: invoice?.sku || LOOK_SKU,
    price_usd: invoice?.amount_usd || LOOK_USD,
    amount_base_units: invoice?.amount_base_units || LOOK_AMOUNT,
  };
}

function amountOf(invoice?: MeterAcceptInvoice, sku?: MeterAcceptSku): string {
  return invoice?.amount_base_units || sku?.amount_base_units || LOOK_AMOUNT;
}

export function meterSolanaExactAccept(invoice?: MeterAcceptInvoice, sku?: MeterAcceptSku): MeterExactAccept {
  const catalog = catalogOf(invoice, sku);
  const amount = amountOf(invoice, catalog);
  const extra: Record<string, unknown> = {
    sku: catalog.id,
    price_usd: catalog.price_usd,
    symbol: "USDC",
    decimals: 6,
    question: LOOK_QUESTION,
    match: "solana-pay-reference",
  };
  if (invoice?.reference) extra.reference = invoice.reference;
  if (invoice?.invoice_id) extra.invoice_id = invoice.invoice_id;
  return {
    scheme: "exact",
    network: "solana",
    amount,
    payTo: lockedSolanaUsdcRecipient(),
    asset: USDC_MINT,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra,
  };
}

export function meterBaseExactAccept(invoice?: MeterAcceptInvoice, sku?: MeterAcceptSku): MeterExactAccept {
  const catalog = catalogOf(invoice, sku);
  const amount = amountOf(invoice, catalog);
  const extra: Record<string, unknown> = {
    sku: catalog.id,
    price_usd: catalog.price_usd,
    symbol: "USDC",
    decimals: 6,
    name: BASE_USDC_EIP712_NAME,
    version: BASE_USDC_EIP712_VERSION,
    assetTransferMethod: "eip3009",
    caip2: BASE_CAIP2,
    question: LOOK_QUESTION,
  };
  if (invoice?.reference) extra.reference = invoice.reference;
  if (invoice?.invoice_id) extra.invoice_id = invoice.invoice_id;
  return {
    scheme: "exact",
    network: BASE_X402_NETWORK,
    amount,
    payTo: lockedEvmUsdcRecipient(),
    asset: BASE_USDC,
    maxTimeoutSeconds: METER_X402_MAX_TIMEOUT_SEC,
    extra,
  };
}

/** Solana first (existing clients), then Base EIP-3009 exact. */
export function meterPaymentAccepts(invoice?: MeterAcceptInvoice, sku?: MeterAcceptSku): MeterExactAccept[] {
  return [meterSolanaExactAccept(invoice, sku), meterBaseExactAccept(invoice, sku)];
}

/**
 * PAYMENT-REQUIRED accepts for CDP Bazaar / x402 v2 clients.
 * Same locked payTo, asset, and amounts. Base first so CDP validate accepts[0]
 * is a facilitator-supported network. JSON 402 body stays Solana-first.
 */
export function meterPaymentRequiredAccepts(
  invoice?: MeterAcceptInvoice,
  sku?: MeterAcceptSku,
  resourceUrl?: string,
): MeterExactAccept[] {
  const [solana, base] = meterPaymentAccepts(invoice, sku);
  const attach = (row: MeterExactAccept, network: string, extra: Record<string, unknown>): MeterExactAccept => ({
    ...row,
    network,
    extra: {
      ...row.extra,
      ...extra,
      ...(resourceUrl ? { resource: resourceUrl } : {}),
    },
  });
  return [
    attach(base, BASE_CAIP2, {}),
    attach(solana, SOLANA_CAIP2, { caip2: SOLANA_CAIP2 }),
  ];
}

/**
 * Discovery accepts for GET /.well-known/x402.
 * Primary = empty POST door (looks_20 $0.20 / 200000). look $0.10 is optional (sku=look).
 * Same locked payTo / asset as live 402. Resource method stays POST.
 */
export function meterLookAccepts(): MeterExactAccept[] {
  const paid: MeterAcceptInvoice = {
    amount_base_units: LOOKS_20_AMOUNT,
    sku: LOOKS_20_SKU,
    amount_usd: LOOKS_20_USD,
  };
  const paidSku: MeterAcceptSku = {
    id: LOOKS_20_SKU,
    price_usd: LOOKS_20_USD,
    amount_base_units: LOOKS_20_AMOUNT,
  };
  const look: MeterAcceptInvoice = {
    amount_base_units: LOOK_AMOUNT,
    sku: LOOK_SKU,
    amount_usd: LOOK_USD,
  };
  const lookSku: MeterAcceptSku = { id: LOOK_SKU, price_usd: LOOK_USD, amount_base_units: LOOK_AMOUNT };
  const resource = "https://agent-control.net/api/v1/meter/pass";
  const attach = (row: MeterExactAccept): MeterExactAccept => ({
    ...row,
    extra: { ...row.extra, resource },
  });
  return [
    ...meterPaymentAccepts(paid, paidSku).map(attach),
    ...meterPaymentAccepts(look, lookSku).map(attach),
  ];
}

export function meterFundsAccepts() {
  return {
    pay_to: SOLANA_PAYOUT_ADDRESS,
    chain: "solana" as const,
    asset: "usdc" as const,
    mint: USDC_MINT,
    match: "solana-pay-reference" as const,
    base_pay_to: EVM_PAYOUT_ADDRESS,
    accepts: [
      {
        chain: "base" as const,
        network: BASE_X402_NETWORK,
        scheme: "exact" as const,
        pay_to: EVM_PAYOUT_ADDRESS,
        asset: BASE_USDC,
        extra: {
          name: BASE_USDC_EIP712_NAME,
          version: BASE_USDC_EIP712_VERSION,
          assetTransferMethod: "eip3009",
          caip2: BASE_CAIP2,
        },
      },
      {
        chain: "solana" as const,
        network: "solana" as const,
        scheme: "exact" as const,
        pay_to: SOLANA_PAYOUT_ADDRESS,
        asset: USDC_MINT,
        match: "solana-pay-reference" as const,
      },
    ],
  };
}
