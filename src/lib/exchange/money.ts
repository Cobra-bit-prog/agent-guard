import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";

/**
 * Job prices use the same unit as pay_requests.amount_usdc: integer whole USDC,
 * not cents. Ten percent is exact in 6-decimal USDC because a whole dollar is
 * 1_000_000 micros and that divides by 10 with no remainder.
 */
export const EXCHANGE_FEE_NUMERATOR = 1n;
export const EXCHANGE_FEE_DENOMINATOR = 10n;
export const USDC_MICROS = 1_000_000n;

export { SOLANA_PAYOUT_ADDRESS, USDC_MINT };

export function assertWholeUsdc(amount: number, label = "amount_usdc"): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive whole USDC amount`);
  }
  return amount;
}

export function amountMicros(amountUsdc: number): bigint {
  return BigInt(assertWholeUsdc(amountUsdc)) * USDC_MICROS;
}

export function formatUsdcMicros(micros: bigint): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / USDC_MICROS;
  const frac = abs % USDC_MICROS;
  let text = whole.toString();
  if (frac !== 0n) {
    text += "." + frac.toString().padStart(6, "0").replace(/0+$/, "");
  }
  return negative ? `-${text}` : text;
}

/** 10% of the job price. Book label only. Not a second transfer. */
export function feeUsdc(amountUsdc: number): string {
  const fee = (amountMicros(amountUsdc) * EXCHANGE_FEE_NUMERATOR) / EXCHANGE_FEE_DENOMINATOR;
  return formatUsdcMicros(fee);
}

/** 90% of the job price. The one outgoing transfer when the job is done. */
export function workerShareUsdc(amountUsdc: number): string {
  const micros = amountMicros(amountUsdc);
  const fee = (micros * EXCHANGE_FEE_NUMERATOR) / EXCHANGE_FEE_DENOMINATOR;
  return formatUsdcMicros(micros - fee);
}

/** 100% of the job price. The one outgoing transfer on a refund. */
export function fullAmountUsdc(amountUsdc: number): string {
  return formatUsdcMicros(amountMicros(amountUsdc));
}

export function normalizeUsdc(value: string | number | bigint): string {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Bad USDC amount: ${text}`);
  }
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [wholeRaw, fracRaw = ""] = unsigned.split(".");
  const whole = BigInt(wholeRaw).toString();
  const frac = fracRaw.replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${body}` : body;
}

export function usdcEqual(left: string | number | bigint, right: string | number | bigint): boolean {
  return normalizeUsdc(left) === normalizeUsdc(right);
}

function usdcMicros(value: string | number | bigint): bigint {
  const text = normalizeUsdc(value);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, frac = ""] = unsigned.split(".");
  const micros = BigInt(whole) * USDC_MICROS + BigInt(frac.padEnd(6, "0").slice(0, 6));
  return negative ? -micros : micros;
}

/** Add USDC amounts. Used to show a wallet balance without calling that balance profit. */
export function sumUsdc(parts: Array<string | number>): string {
  let total = 0n;
  for (const part of parts) total += usdcMicros(part);
  return formatUsdcMicros(total);
}
