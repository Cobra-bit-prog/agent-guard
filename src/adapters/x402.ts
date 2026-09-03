/**
 * x402 pre-pay helper.
 * Matches x402Client.onBeforePaymentCreation (PaymentCreationContext) from @x402/core.
 * Return { abort: true, reason } to refuse before the payment is created.
 * Calls POST /api/v1/check. Does not create or settle a payment.
 */

import { createCheckClient, type CheckClientOptions, type CheckOutcome } from "./check-client.ts";

/** x402 v2 PaymentRequirements, plus v1 maxAmountRequired. */
export type X402PaymentRequirements = {
  payTo: string;
  amount?: string;
  maxAmountRequired?: string;
  extra?: Record<string, unknown>;
};

/** x402 PaymentCreationContext — we only need selectedRequirements. */
export type X402PaymentCreationContext = {
  selectedRequirements: X402PaymentRequirements;
};

export type X402BeforePaymentResult = { abort: true; reason: string } | void;

export type X402BeforePaymentHook = (
  context: X402PaymentCreationContext,
) => Promise<X402BeforePaymentResult>;

export type X402CheckOptions = CheckClientOptions & {
  /** Atomic amount decimals. USDC is 6. Ignored when extra.value_usd is set. */
  assetDecimals?: number;
};

function usdFromAtomic(atomic: string, decimals: number): number | null {
  const n = Number(atomic);
  if (!Number.isFinite(n) || n <= 0) return null;
  const scale = 10 ** decimals;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const usd = n / scale;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return usd;
}

export function valueUsdFromX402Requirements(
  requirements: X402PaymentRequirements,
  assetDecimals = 6,
): number | null {
  const extra = requirements.extra;
  if (extra && typeof extra.value_usd === "number") {
    if (Number.isFinite(extra.value_usd) && extra.value_usd > 0) return extra.value_usd;
  }
  const atomic = requirements.amount ?? requirements.maxAmountRequired;
  if (atomic === undefined || atomic === "") return null;
  return usdFromAtomic(atomic, assetDecimals);
}

function abortFromOutcome(outcome: CheckOutcome): { abort: true; reason: string } {
  if (!outcome.ok) {
    return { abort: true, reason: outcome.error };
  }
  const reason = outcome.check.reasons[0];
  if (outcome.verdict === "wait") {
    return {
      abort: true,
      reason: reason ?? "Held — wait for Approval Inbox.",
    };
  }
  return {
    abort: true,
    reason: reason ?? "Do not send.",
  };
}

/**
 * Drop-in for `client.onBeforePaymentCreation(...)`.
 * Allow → proceed (void). Wait or stop → abort so money does not move.
 */
export function createX402BeforePaymentHook(options: X402CheckOptions): X402BeforePaymentHook {
  const client = createCheckClient(options);
  const decimals = options.assetDecimals ?? 6;
  return async (context: X402PaymentCreationContext): Promise<X402BeforePaymentResult> => {
    const requirements = context.selectedRequirements;
    const to = String(requirements?.payTo ?? "").trim();
    const valueUsd = requirements ? valueUsdFromX402Requirements(requirements, decimals) : null;
    if (!to || valueUsd === null) {
      return { abort: true, reason: "Provide a destination and amount." };
    }
    const outcome = await client.check({ to, value_usd: valueUsd });
    if (!outcome.ok || outcome.verdict !== "allow") {
      return abortFromOutcome(outcome);
    }
  };
}

/** Same check from an x402 payment requirement, without the hook wrapper. */
export async function checkBeforePay(
  options: X402CheckOptions,
  requirements: X402PaymentRequirements,
): Promise<CheckOutcome> {
  const client = createCheckClient(options);
  const to = String(requirements.payTo ?? "").trim();
  const valueUsd = valueUsdFromX402Requirements(requirements, options.assetDecimals ?? 6);
  if (!to || valueUsd === null) {
    return { ok: false, error: "Provide a destination and amount." };
  }
  return client.check({ to, value_usd: valueUsd });
}
