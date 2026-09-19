/**
 * In-process CDP / AgentKit settle fields for a Meter 402.
 * Hosts with a funded Base wallet signExact EIP-3009 on THEIR machine,
 * then call meter_watch. We never take keys. payTo is locked.
 */

import { EVM_USDC, lockedEvmUsdcRecipient } from "../evm-pay.ts";
import {
  BASE_CAIP2,
  BASE_USDC,
  BASE_USDC_EIP712_NAME,
  BASE_USDC_EIP712_VERSION,
  BASE_X402_NETWORK,
  METER_X402_MAX_TIMEOUT_SEC,
} from "./accepts.ts";

export const METER_EXACT_PRIMARY_TYPE = "TransferWithAuthorization" as const;
export const METER_SIGN_EXACT_NEXT_TOOL = "meter_watch" as const;

export const METER_EXACT_AUTHORIZATION_TYPES = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

/** Invoice already in hand — finish on YOUR machine, then meter_watch. */
export const METER_ADAPTER_SNIPPET = `import { payMeterPassBase } from "./src/adapters/meter-pay-base.ts";
const { payment } = await payMeterPassBase({ invoice, from, signExact });
// meter_watch({ invoice_id: invoice.invoice_id, payment }) until token`;

export const METER_402_TOOL_FIELDS = [
  "preferred_rail",
  "base_pay_to",
  "amount_usd",
  "amount_base_units",
  "invoice_id",
  "reference",
  "sign_exact",
  "adapter_snippet",
  "watch_url",
  "next_tool",
  "next_steps",
] as const;

export type MeterSignExactInvoice = {
  invoice_id: string;
  reference: string;
  amount_base_units: string;
};

export function meterExactEip712Domain() {
  return {
    name: BASE_USDC_EIP712_NAME,
    version: BASE_USDC_EIP712_VERSION,
    chainId: EVM_USDC.base.chainId,
    verifyingContract: BASE_USDC,
  };
}

export function meter402SignExact(invoice: MeterSignExactInvoice) {
  const payTo = lockedEvmUsdcRecipient();
  const value = invoice.amount_base_units;
  const authorization = {
    from: "",
    to: payTo,
    value,
    validAfter: "0",
    validBefore: "",
    nonce: "",
  };
  return {
    scheme: "exact" as const,
    network: BASE_X402_NETWORK,
    chain_id: EVM_USDC.base.chainId,
    caip2: BASE_CAIP2,
    asset: BASE_USDC,
    pay_to: payTo,
    value,
    max_timeout_seconds: METER_X402_MAX_TIMEOUT_SEC,
    primaryType: METER_EXACT_PRIMARY_TYPE,
    domain: meterExactEip712Domain(),
    types: {
      TransferWithAuthorization: METER_EXACT_AUTHORIZATION_TYPES.map((field) => ({ ...field })),
    },
    authorization,
    payment_template: {
      x402Version: 2,
      payload: {
        authorization,
        signature: "",
      },
      accepted: {
        network: BASE_X402_NETWORK,
        extra: {
          invoice_id: invoice.invoice_id,
          reference: invoice.reference,
        },
      },
    },
    next_tool: METER_SIGN_EXACT_NEXT_TOOL,
    watch: {
      tool: METER_SIGN_EXACT_NEXT_TOOL,
      invoice_id: invoice.invoice_id,
      payment: "x402 v2 payment object from payMeterPassBase / sign_exact.payment_template after you fill signature ({ x402Version, payload:{ authorization, signature }, accepted }). Never a bare signature string or secret key.",
    },
    sign: "On YOUR machine: CDP/AgentKit/viem signTypedData (TransferWithAuthorization) using sign_exact.domain + types + authorization. Fill from, nonce, validBefore. We never take keys.",
  };
}
