import { isEvmAddress } from "@/lib/chains";
import { evmRpcUrl, rpc } from "@/lib/onchain";
import { PAY_EXPIRY_MS } from "@/lib/solana-pay";
import {
  EVM_USDC,
  TRANSFER_TOPIC0,
  type EvmPayChain,
} from "@/lib/evm-pay";

export type EvmMatchResult =
  | { kind: "none" }
  | { kind: "paid"; signature: string; amountUsdc: number }
  | { kind: "underpaid"; signature: string; amountUsdc: number };

export function evmPayoutAddress(): string | null {
  const value = process.env.EVM_PAYOUT_ADDRESS?.trim();
  if (!value) return null;
  if (!isEvmAddress(value)) {
    console.error("[billing] EVM_PAYOUT_ADDRESS is not a valid 0x address");
    return null;
  }
  return value;
}

export function evmCheckoutConfigured(): boolean {
  return Boolean(evmPayoutAddress());
}

function padTopicAddress(address: string): string {
  return `0x${address.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

function parseHexBigInt(hex: string | undefined): bigint {
  if (!hex) return 0n;
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!h) return 0n;
  try {
    return BigInt(`0x${h}`);
  } catch {
    return 0n;
  }
}

function randomExtraMicros(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1 + (buf[0] % 999_999);
}

/** planPrice * 1e6 + unique extra micros in 1..999999 that is free on this chain. */
export async function allocateUniqueUsdcAmount(
  usedBaseUnits: Iterable<string>,
  planPriceUsdc: number,
): Promise<string> {
  const base = BigInt(planPriceUsdc) * 1_000_000n;
  const taken = new Set(usedBaseUnits);
  for (let i = 0; i < 64; i += 1) {
    const amount = String(base + BigInt(randomExtraMicros()));
    if (!taken.has(amount)) return amount;
  }
  throw new Error("Could not allocate a unique USDC amount. Try again.");
}

type EvmLog = {
  data?: string;
  transactionHash?: string;
  topics?: string[];
};

export async function findMatchingEvmUsdcPayment(opts: {
  chain: EvmPayChain;
  recipient: string;
  amountBaseUnits: string;
  createdAt?: string;
}): Promise<EvmMatchResult> {
  const net = EVM_USDC[opts.chain];
  const endpoint = evmRpcUrl(opts.chain);
  const expected = BigInt(opts.amountBaseUnits);
  if (expected <= 0n) return { kind: "none" };

  let latest = 0;
  try {
    const latestHex = await rpc<string>(endpoint, "eth_blockNumber", []);
    latest = Number.parseInt(latestHex, 16);
  } catch (err) {
    console.error("[billing] eth_blockNumber failed", opts.chain, err);
    return { kind: "none" };
  }
  if (!Number.isFinite(latest) || latest <= 0) return { kind: "none" };

  const created = opts.createdAt ? new Date(opts.createdAt).getTime() : Date.now() - PAY_EXPIRY_MS;
  const ageMs = Math.max(60_000, Date.now() - created) + 120_000;
  const lookback = Math.min(
    Math.ceil(ageMs / 1000 / net.blockSeconds) + 80,
    opts.chain === "base" ? 2000 : 400,
  );
  const fromBlock = Math.max(0, latest - lookback);

  let logs: EvmLog[] = [];
  try {
    logs = await rpc<EvmLog[]>(endpoint, "eth_getLogs", [
      {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: "latest",
        address: net.usdc,
        topics: [TRANSFER_TOPIC0, null, padTopicAddress(opts.recipient)],
      },
    ]);
  } catch (err) {
    console.error("[billing] eth_getLogs failed", opts.chain, err);
    return { kind: "none" };
  }
  if (!Array.isArray(logs) || logs.length === 0) return { kind: "none" };

  let bestUnder: EvmMatchResult | null = null;
  for (const log of logs) {
    const value = parseHexBigInt(log.data);
    if (value <= 0n) continue;
    const hash = log.transactionHash;
    if (!hash) continue;
    const amountUsdc = Number(value) / 1e6;
    if (value === expected) {
      return { kind: "paid", signature: hash, amountUsdc };
    }
    if (value < expected) {
      bestUnder = { kind: "underpaid", signature: hash, amountUsdc };
    }
  }
  return bestUnder ?? { kind: "none" };
}
