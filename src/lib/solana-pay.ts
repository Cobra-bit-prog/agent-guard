/** Native USDC billing. No card, no Stripe checkout. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const PAY_EXPIRY_MS = 30 * 60 * 1000;
export const PERIOD_DAYS = 30;

/**
 * Production Phantom receive pubkey for every human Solana USDC payment.
 * Must match Vercel Production `SOLANA_PAYOUT_ADDRESS`.
 * Do not read this from query params, JSON bodies, or env overrides.
 */
export const SOLANA_PAYOUT_ADDRESS = "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR";

/** Ignore any candidate wallet — env mistakes and query strings cannot retarget funds. */
export function lockedSolanaUsdcRecipient(_candidate?: string | null): string {
  return SOLANA_PAYOUT_ADDRESS;
}

export const RECEIVE_WALLET_SWITCH_ERROR =
  "Switch to a different wallet that holds USDC — you cannot pay from the receive wallet.";

export function isReceiveWalletPayer(payer: string): boolean {
  return payer.trim() === SOLANA_PAYOUT_ADDRESS;
}

/** Refuse a self-send from the locked payout wallet. */
export function assertPayerIsNotReceiveWallet(payer: string): void {
  if (isReceiveWalletPayer(payer)) {
    throw new Error(RECEIVE_WALLET_SWITCH_ERROR);
  }
}

export type PayChain = "solana" | "ethereum" | "base";

export const PAY_CHAIN_LABEL: Record<PayChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
};

/** Convert a USDC UI amount (including $0.25) to 6-decimal base units. */
export function usdcBaseUnits(uiAmount: number): string {
  const micros = Math.round(Number(uiAmount) * 10 ** USDC_DECIMALS);
  if (!Number.isFinite(micros) || micros < 0) return "0";
  return String(micros);
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
  recipient?: string;
  amountUsdc: number;
  reference: string;
  planName?: string;
}): string {
  const amount = Number(opts.amountUsdc);
  const q = new URLSearchParams({
    amount: String(amount),
    "spl-token": USDC_MINT,
    reference: opts.reference,
    label: "Agent Control",
    message: `Pay $${amount}`,
  });
  return `solana:${lockedSolanaUsdcRecipient(opts.recipient)}?${q.toString()}`;
}

/** HTTPS universal link: opens the Phantom app, or the App Store / download page. */
export function phantomBrowseUrl(solanaUrl: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(solanaUrl)}?ref=${encodeURIComponent("https://agent-control.net")}`;
}

const B58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaPayReference(value: string): boolean {
  return B58_RE.test(value.trim());
}

function unwrapPhantomBrowseUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith("phantom.app")) return trimmed;
    const marker = "/ul/browse/";
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return trimmed;
    return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch {
    return trimmed;
  }
}

export type ParsedSolanaPayUrl = {
  recipient: string;
  amountUsdc: number | null;
  reference: string | null;
  mint: string | null;
  payUrl: string;
};

/** Parse a solana: Pay URL (or Phantom browse wrapper). Recipient is always the locked payout wallet. */
export function parseSolanaPayUrl(raw: string): ParsedSolanaPayUrl | null {
  const text = unwrapPhantomBrowseUrl(raw);
  const lower = text.toLowerCase();
  if (!lower.startsWith("solana:")) return null;
  const rest = text.slice("solana:".length);
  const qIndex = rest.indexOf("?");
  const recipientRaw = (qIndex === -1 ? rest : rest.slice(0, qIndex)).trim();
  const query = qIndex === -1 ? "" : rest.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  const amountRaw = params.get("amount");
  const amountNum = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : NaN;
  const amountUsdc = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;
  const referenceRaw = (params.get("reference") ?? "").trim();
  const reference = isSolanaPayReference(referenceRaw) ? referenceRaw : null;
  const mint = (params.get("spl-token") ?? "").trim() || null;
  const recipient = lockedSolanaUsdcRecipient(recipientRaw);
  const payUrl = buildSolanaPayUrl({
    recipient,
    amountUsdc: amountUsdc ?? 0.25,
    reference: reference ?? referenceRaw,
  });
  return { recipient, amountUsdc, reference, mint, payUrl };
}

export type PayStatus = "pending" | "paid" | "expired" | "underpaid";

export type PayRequestView = {
  id: string;
  plan: string;
  chain: PayChain;
  asset: "usdc" | "sol" | "eth";
  symbol: string;
  amountUsdc: number;
  amountBaseUnits: string;
  exactAmountUsdc: string;
  exactAmount: string;
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
