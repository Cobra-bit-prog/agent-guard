/** Native USDC billing. No card, no Stripe checkout. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const PAY_EXPIRY_MS = 30 * 60 * 1000;
export const PERIOD_DAYS = 30;

export type PayChain = "solana" | "ethereum" | "base";

export const PAY_CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

export function usdcBaseUnits(uiAmount: number): string {
  return String(BigInt(uiAmount) * 10n ** BigInt(USDC_DECIMALS));
}

/** Exact USDC amount from base units, up to 6 decimal places. */
export function formatUsdcExact(baseUnits: string): string {
  let n: bigint;
  try {
    n = BigInt(baseUnits);
  } catch {
    return "0";
  }
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  const s = fracStr ? `${whole}.${fracStr}` : String(whole);
  return neg ? `-${s}` : s;
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
    label: "Agent Control",
    message: `${opts.planName} on agent-control.net`,
  });
  return `solana:${opts.recipient}?${q.toString()}`;
}

/** HTTPS universal link: opens the Phantom app, or the App Store / download page. */
export function phantomBrowseUrl(solanaUrl: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(solanaUrl)}?ref=${encodeURIComponent("https://agent-control.net")}`;
}

export type PayStatus = "pending" | "paid" | "expired" | "underpaid";

export type PayRequestView = {
  id: string;
  plan: string;
  chain: PayChain;
  amountUsdc: number;
  amountBaseUnits: string;
  exactAmountUsdc: string;
  reference: string;
  recipient: string;
  status: PayStatus;
  signature: string | null;
  paidAmountUsdc: number | null;
  expiresAt: string;
  payUrl: string;
  metamaskUrl: string | null;
  checkoutConfigured: boolean;
};
