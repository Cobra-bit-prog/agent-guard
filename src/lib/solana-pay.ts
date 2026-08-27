/** Native USDC-on-Solana billing. No card, no Stripe checkout. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const PAY_EXPIRY_MS = 30 * 60 * 1000;
export const PERIOD_DAYS = 30;

export function usdcBaseUnits(uiAmount: number): string {
  return String(BigInt(uiAmount) * 10n ** BigInt(USDC_DECIMALS));
}

export function buildSolanaPayUrl(opts: {
  recipient: string;
  amountUsdc: number;
  reference: string;
  planName: string;
}): string {
  const q = new URLSearchParams({
    amount: String(opts.amountUsdc),
    "spl-token": USDC_MINT,
    reference: opts.reference,
    label: "Agent Guard",
    message: `${opts.planName} on agent-control.net`,
  });
  return `solana:${opts.recipient}?${q.toString()}`;
}

export function phantomBrowseUrl(solanaUrl: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(solanaUrl)}?ref=https://agent-control.net`;
}

export type PayStatus = "pending" | "paid" | "expired" | "underpaid";

export type PayRequestView = {
  id: string;
  plan: string;
  amountUsdc: number;
  reference: string;
  recipient: string;
  status: PayStatus;
  signature: string | null;
  paidAmountUsdc: number | null;
  expiresAt: string;
  payUrl: string;
  checkoutConfigured: boolean;
};
