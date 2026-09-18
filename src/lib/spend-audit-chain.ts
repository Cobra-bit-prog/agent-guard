import { EVM_USDC } from "./evm-pay.ts";
import {
  readRecentTransfers,
  rpc,
  solanaRpcUrl,
  type ChainTransfer,
} from "./onchain.ts";
import { USDC_MINT } from "./solana-pay.ts";
import { SPEND_AUDIT_LOOKBACK_DAYS, type SpendAuditChain, type SpendAuditTransfer } from "./spend-audit.ts";

const BLOCKSCOUT = {
  base: "https://base.blockscout.com/api",
  ethereum: "https://eth.blockscout.com/api",
} as const;

function asTransfer(tx: ChainTransfer): SpendAuditTransfer {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    valueUsd: tx.valueUsd,
    timestamp: tx.timestamp,
    status: tx.status,
    kind: tx.kind,
  };
}

function dedupe(rows: SpendAuditTransfer[]): SpendAuditTransfer[] {
  const seen = new Set<string>();
  const out: SpendAuditTransfer[] = [];
  for (const row of rows) {
    const key = `${row.hash}:${row.to}:${row.valueUsd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function readEvmUsdc(chain: "base" | "ethereum", address: string): Promise<SpendAuditTransfer[]> {
  const usdc = EVM_USDC[chain].usdc;
  const url = `${BLOCKSCOUT[chain]}?module=account&action=tokentx&contractaddress=${usdc}&address=${encodeURIComponent(address)}&page=1&offset=50&sort=desc`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  const j = (await res.json()) as {
    result?: Array<{
      hash: string;
      from: string;
      to: string;
      value: string;
      tokenDecimal?: string;
      timeStamp: string;
    }>;
  };
  if (!Array.isArray(j.result)) return [];
  return j.result.slice(0, 50).map((tx) => {
    const decimals = Number(tx.tokenDecimal ?? 6) || 6;
    const raw = Number(tx.value ?? 0) / 10 ** decimals;
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || address,
      valueUsd: raw,
      timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      status: "success" as const,
      kind: "USDC",
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
    preTokenBalances?: Array<{
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }>;
    postTokenBalances?: Array<{
      mint?: string;
      owner?: string;
      uiTokenAmount?: { uiAmount?: number | null };
    }>;
  };
  transaction?: {
    message?: { accountKeys?: Array<string | { pubkey?: string }> };
  };
};

async function readSolanaLookback(address: string): Promise<SpendAuditTransfer[]> {
  const sigs = await rpc<SolSig[]>(solanaRpcUrl(), "getSignaturesForAddress", [address, { limit: 40 }]);
  if (!Array.isArray(sigs) || sigs.length === 0) return [];
  const rows = await Promise.all(
    sigs.slice(0, 40).map(async (s) => {
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
        const native: SpendAuditTransfer = {
          hash: s.signature,
          from: address,
          to: toKey,
          valueUsd: deltaSol * 140,
          timestamp: new Date((tx?.blockTime || s.blockTime || 0) * 1000).toISOString(),
          status: tx?.meta?.err || s.err ? "failed" : "success",
          kind: "SOL",
        };
        const preUsdc = (tx?.meta?.preTokenBalances ?? []).find(
          (b) => b.mint === USDC_MINT && (b.owner === address || !b.owner),
        );
        const postUsdc = (tx?.meta?.postTokenBalances ?? []).find(
          (b) => b.mint === USDC_MINT && (b.owner === address || !b.owner),
        );
        const preAmt = Number(preUsdc?.uiTokenAmount?.uiAmount ?? 0);
        const postAmt = Number(postUsdc?.uiTokenAmount?.uiAmount ?? 0);
        const usdcDelta = preAmt - postAmt;
        if (usdcDelta > 0.000001) {
          return {
            ...native,
            valueUsd: usdcDelta,
            kind: "USDC",
            status: native.status === "failed" ? "failed" : "success",
          } satisfies SpendAuditTransfer;
        }
        return native;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is SpendAuditTransfer => Boolean(r));
}

export async function readSpendLookback(input: {
  chain: SpendAuditChain;
  address: string;
  lookbackDays?: number;
  nowMs?: number;
}): Promise<SpendAuditTransfer[]> {
  const lookbackDays = input.lookbackDays ?? SPEND_AUDIT_LOOKBACK_DAYS;
  const nowMs = input.nowMs ?? Date.now();
  const cutoff = nowMs - lookbackDays * 24 * 60 * 60 * 1000;
  const rows: SpendAuditTransfer[] = [];
  try {
    if (input.chain === "solana") {
      rows.push(...(await readSolanaLookback(input.address)));
    } else {
      const native = await readRecentTransfers(input.chain, input.address);
      rows.push(...native.map(asTransfer));
      try {
        rows.push(...(await readEvmUsdc(input.chain, input.address)));
      } catch {
        /* native rows still useful */
      }
    }
  } catch {
    return [];
  }
  return dedupe(rows).filter((row) => {
    const t = Date.parse(row.timestamp);
    return Number.isFinite(t) ? t >= cutoff : true;
  });
}
