export const CHAINS = {
  base: {
    id: "base" as const,
    name: "Base",
    explorer: "https://basescan.org/address/",
    txExplorer: "https://basescan.org/tx/",
    native: "ETH",
    kind: "evm" as const,
  },
  ethereum: {
    id: "ethereum" as const,
    name: "Ethereum",
    explorer: "https://etherscan.io/address/",
    txExplorer: "https://etherscan.io/tx/",
    native: "ETH",
    kind: "evm" as const,
  },
  solana: {
    id: "solana" as const,
    name: "Solana",
    explorer: "https://solscan.io/account/",
    txExplorer: "https://solscan.io/tx/",
    native: "SOL",
    kind: "solana" as const,
  },
} as const;

export type ChainId = keyof typeof CHAINS;

export const CHAIN_LIST = Object.values(CHAINS);

export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function validateAddress(chain: ChainId, address: string) {
  const a = address.trim();
  if (chain === "solana") return isSolanaAddress(a);
  return isEvmAddress(a);
}
