/**
 * Dual-rail Meter payment accepts: Base USDC (EIP-3009 exact) + Solana USDC.
 * Payouts are locked constants. Query strings cannot retarget funds.
 */

import { EVM_PAYOUT_ADDRESS, EVM_USDC, lockedEvmUsdcRecipient } from "../evm-pay.ts";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT, lockedSolanaUsdcRecipient } from "../solana-pay.ts";

export const BASE_USDC = EVM_USDC.base.usdc;
export const BASE_USDC_EIP712_NAME = "USD Coin";
export const BASE_USDC_EIP712_VERSION = "2";
/** AgentKit / CDP v1 network id. CAIP-2 is extra.caip2. */
export const BASE_X402_NETWORK = "base";
export const BASE_CAIP2 = "eip155:8453";
export const METER_X402_MAX_TIMEOUT_SEC = 300;

export { EVM_PAYOUT_ADDRESS, lockedEvmUsdcRecipient };

const LOOK_QUESTION = "Can I pay this address?";
const LOOK_SKU = "look";
const LOOK_USD = 0.1;
const LOOK_AMOUNT = "100000";

export type MeterExactAccept = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
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
    maxAmountRequired: amount,
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
    maxAmountRequired: amount,
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

/** Look-door discovery accepts. Same locked payTo / asset / amount as live 402. */
export function meterLookAccepts(): MeterExactAccept[] {
  const look: MeterAcceptInvoice = {
    amount_base_units: LOOK_AMOUNT,
    sku: LOOK_SKU,
    amount_usd: LOOK_USD,
  };
  const sku: MeterAcceptSku = { id: LOOK_SKU, price_usd: LOOK_USD, amount_base_units: LOOK_AMOUNT };
  const [solana, base] = meterPaymentAccepts(look, sku);
  const resource = "https://agent-control.net/api/v1/meter/pass";
  return [
    { ...solana, extra: { ...solana.extra, resource } },
    { ...base, extra: { ...base.extra, resource } },
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
