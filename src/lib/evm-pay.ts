/** Native USDC on Ethereum and Base. Public contracts, not secrets. No card. */

export const EVM_USDC_DECIMALS = 6;

/**
 * Production EVM receive address for Meter Base USDC (EIP-3009 exact).
 * Ethereum/Base. Must match Vercel Production `EVM_PAYOUT_ADDRESS`.
 * Do not read this from query params, JSON bodies, or env overrides on Meter.
 */
export const EVM_PAYOUT_ADDRESS = "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98";

/** Ignore any candidate wallet — env mistakes and query strings cannot retarget Meter Base funds. */
export function lockedEvmUsdcRecipient(_candidate?: string | null): string {
  return EVM_PAYOUT_ADDRESS;
}

export const EVM_USDC = {
  ethereum: {
    chain: "ethereum" as const,
    name: "Ethereum",
    chainId: 1,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    blockSeconds: 12,
  },
  base: {
    chain: "base" as const,
    name: "Base",
    chainId: 8453,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    blockSeconds: 2,
  },
} as const;

export type EvmPayChain = keyof typeof EVM_USDC;

export const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function buildEip681TransferUrl(opts: {
  chain: EvmPayChain;
  recipient: string;
  amountBaseUnits: string;
}): string {
  const net = EVM_USDC[opts.chain];
  const q = new URLSearchParams({
    address: opts.recipient,
    uint256: opts.amountBaseUnits,
  });
  return `ethereum:${net.usdc}@${net.chainId}/transfer?${q.toString()}`;
}

export function buildMetamaskSendUrl(opts: {
  chain: EvmPayChain;
  recipient: string;
  amountBaseUnits: string;
}): string {
  const net = EVM_USDC[opts.chain];
  return `https://link.metamask.io/send/${net.usdc}@${net.chainId}/transfer?address=${opts.recipient}&uint256=${opts.amountBaseUnits}`;
}
