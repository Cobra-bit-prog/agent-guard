/** Customer pay choice: USDC on Solana, native SOL, or native ETH. */

export type PayAsset = "usdc" | "sol" | "eth";

export const PAY_ASSET_LABEL: Record<PayAsset, string> = {
  usdc: "USDC",
  sol: "SOL",
  eth: "ETH",
};

export const PAY_ASSET_CHAIN: Record<PayAsset, "solana" | "ethereum"> = {
  usdc: "solana",
  sol: "solana",
  eth: "ethereum",
};

export const PAY_ASSET_DECIMALS: Record<PayAsset, number> = {
  usdc: 6,
  sol: 9,
  eth: 18,
};

export function asPayAsset(value: string | null | undefined): PayAsset {
  if (value === "sol" || value === "eth" || value === "usdc") return value;
  return "usdc";
}

export function formatExactAmount(baseUnits: string, decimals: number): string {
  let n: bigint;
  try {
    n = BigInt(baseUnits);
  } catch {
    return "0";
  }
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const s = fracStr ? `${whole}.${fracStr}` : String(whole);
  return neg ? `-${s}` : s;
}

/** Solana Pay URL for native SOL (no spl-token). */
export function buildNativeSolanaPayUrl(opts: {
  recipient: string;
  amountSol: string;
  reference: string;
  planName: string;
}): string {
  const q = new URLSearchParams({
    amount: opts.amountSol,
    reference: opts.reference,
    label: "Agent Control",
    message: `${opts.planName} on agent-control.net`,
  });
  return `solana:${opts.recipient}?${q.toString()}`;
}

/** EIP-681 native ETH transfer. */
export function buildNativeEthPayUrl(recipient: string, amountWei: string): string {
  return `ethereum:${recipient}@1?value=${amountWei}`;
}

export function buildNativeEthMetamaskUrl(recipient: string, amountWei: string): string {
  return `https://link.metamask.io/send/${recipient}@1?value=${amountWei}`;
}
