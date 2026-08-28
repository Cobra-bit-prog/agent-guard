import { CHAINS, type ChainId } from "@/lib/chains";

const RPC: Record<ChainId, string> = {
  base: "https://mainnet.base.org",
  ethereum: "https://ethereum.publicnode.com",
  solana: "https://api.mainnet-beta.solana.com",
};

const BLOCKSCOUT: Record<"base" | "ethereum", string> = {
  base: "https://base.blockscout.com/api",
  ethereum: "https://eth.blockscout.com/api",
};


/** Override with SOLANA_RPC_URL. Default is public mainnet. */
export function solanaRpcUrl(): string {
  const custom = typeof process !== "undefined" ? process.env.SOLANA_RPC_URL?.trim() : "";
  return custom || RPC.solana;
}

/** Override with ETH_RPC_URL / BASE_RPC_URL. Public defaults are fine. */
export function evmRpcUrl(chain: "ethereum" | "base"): string {
  const envName = chain === "ethereum" ? "ETH_RPC_URL" : "BASE_RPC_URL";
  const custom = typeof process !== "undefined" ? process.env[envName]?.trim() : "";
  return custom || RPC[chain];
}

export const USD_PRICE = { ETH: 3200, SOL: 140 };

export type OnchainBalance = {
  native: string;
  usd: number;
  ok: boolean;
  symbol: string;
};

export type ChainTransfer = {
  hash: string;
  from: string;
  to: string;
  valueNative: number;
  valueUsd: number;
  timestamp: string;
  status: "success" | "failed";
  kind: string;
};

const EVM_FALLBACKS: Record<"ethereum" | "base", string[]> = {
  ethereum: [
    "https://ethereum.publicnode.com",
    "https://eth.drpc.org",
    "https://eth-mainnet.public.blastapi.io",
    "https://gateway.tenderly.co/public/mainnet",
    "https://rpc.mevblocker.io",
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
  ],
  base: [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
  ],
};

export function evmRpcUrls(chain: "ethereum" | "base"): string[] {
  const primary = evmRpcUrl(chain);
  const rest = EVM_FALLBACKS[chain].filter((url) => url !== primary);
  return [primary, ...rest];
}

export async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(3500),
      });
      const text = await res.text();
      let parsed: { result?: T; error?: { message?: string } };
      try {
        parsed = JSON.parse(text) as { result?: T; error?: { message?: string } };
      } catch {
        throw new Error(text.slice(0, 80) || "RPC error");
      }
      if (parsed.error) throw new Error(parsed.error.message ?? "RPC error");
      return parsed.result as T;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("RPC error");
}

export async function evmRpc<T>(
  chain: "ethereum" | "base",
  method: string,
  params: unknown[],
): Promise<T> {
  let last: unknown;
  for (const url of evmRpcUrls(chain)) {
    try {
      return await rpc<T>(url, method, params);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("RPC error");
}

export async function readNativeBalance(
  chain: ChainId,
  address: string,
): Promise<OnchainBalance> {
  const symbol = CHAINS[chain].native;
  try {
    if (chain === "ethereum" || chain === "base") {
      const hex = await evmRpc<string>(chain, "eth_getBalance", [address, "latest"]);
      const eth = Number(BigInt(hex ?? "0x0")) / 1e18;
      return { native: eth.toFixed(5), usd: eth * USD_PRICE.ETH, ok: true, symbol };
    }
    const lamports = await rpc<number>(solanaRpcUrl(), "getBalance", [address]).then(
      (r) => (typeof r === "number" ? r : Number((r as { value?: number })?.value ?? 0)),
    );
    const sol = Number(lamports) / 1e9;
    return { native: sol.toFixed(4), usd: sol * USD_PRICE.SOL, ok: true, symbol };
  } catch {
    return { native: "—", usd: 0, ok: false, symbol };
  }
}

export async function readRecentTransfers(
  chain: ChainId,
  address: string,
): Promise<ChainTransfer[]> {
  try {
    if (chain === "solana") return await readSolanaTransfers(address);
    return await readEvmTransfers(chain, address);
  } catch {
    return [];
  }
}

async function readEvmTransfers(chain: "base" | "ethereum", address: string): Promise<ChainTransfer[]> {
  const url = `${BLOCKSCOUT[chain]}?module=account&action=txlist&address=${address}&page=1&offset=15&sort=desc`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  const j = (await res.json()) as {
    result?: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      timeStamp: string;
      isError?: string;
      functionName?: string;
      methodId?: string;
    }>;
  };
  if (!Array.isArray(j.result)) return [];
  return j.result.slice(0, 15).map((tx) => {
    const eth = Number(tx.value ?? 0) / 1e18;
    const method = (tx.functionName || "").split("(")[0] || tx.methodId || "";
    const kind = !method || method === "0x" || method === "0x0" ? "Transfer" : method;
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || address,
      valueNative: eth,
      valueUsd: eth * USD_PRICE.ETH,
      timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      status: tx.isError === "1" ? "failed" : "success",
      kind,
    };
  });
}

type SolSig = { signature: string; blockTime?: number | null; err?: unknown };
type SolTx = {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
  };
  transaction?: {
    message?: { accountKeys?: Array<string | { pubkey?: string }> };
  };
};

async function readSolanaTransfers(address: string): Promise<ChainTransfer[]> {
  const sigs = await rpc<SolSig[]>(solanaRpcUrl(), "getSignaturesForAddress", [
    address,
    { limit: 8 },
  ]);
  if (!Array.isArray(sigs) || sigs.length === 0) return [];
  const rows = await Promise.all(
    sigs.slice(0, 8).map(async (s) => {
      try {
        const tx = await rpc<SolTx>(solanaRpcUrl(), "getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]);
        const keys = (tx?.transaction?.message?.accountKeys ?? []).map((k) =>
          typeof k === "string" ? k : String(k.pubkey ?? ""),
        );
        const idx = keys.findIndex((k) => k === address);
        const pre = tx?.meta?.preBalances?.[idx] ?? 0;
        const post = tx?.meta?.postBalances?.[idx] ?? 0;
        const deltaSol = Math.abs(post - pre) / 1e9;
        const toKey = keys.find((k) => k && k !== address) ?? address;
        return {
          hash: s.signature,
          from: address,
          to: toKey,
          valueNative: deltaSol,
          valueUsd: deltaSol * USD_PRICE.SOL,
          timestamp: new Date((tx?.blockTime || s.blockTime || 0) * 1000).toISOString(),
          status: tx?.meta?.err || s.err ? "failed" : "success",
          kind: "Transfer",
        } satisfies ChainTransfer;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is ChainTransfer => Boolean(r));
}
