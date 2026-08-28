import { isEvmAddress } from "@/lib/chains";
import { evmRpc } from "@/lib/onchain";
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
  return 1 + (buf[0] % 9_999);
}

/** planPrice * 1e6 + unique extra micros in 1..9999 (e.g. 29.000123, never 29.9). */
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

async function getLogs(chain: EvmPayChain, filter: unknown): Promise<EvmLog[]> {
  const logs = await evmRpc<EvmLog[]>(chain, "eth_getLogs", [filter]);
  return Array.isArray(logs) ? logs : [];
}

/** Match a USDC Transfer to payout for the exact uint256 amount. Logs ~last 30 min. */
export async function findMatchingEvmUsdcPayment(opts: {
  chain: EvmPayChain;
  recipient: string;
  amountBaseUnits: string;
  createdAt?: string;
}): Promise<EvmMatchResult> {
  try {
    const net = EVM_USDC[opts.chain];
    const expected = BigInt(opts.amountBaseUnits);
    if (expected <= 0n) return { kind: "none" };

    let latest = 0;
    try {
      const latestHex = await evmRpc<string>(opts.chain, "eth_blockNumber", []);
      latest = Number.parseInt(latestHex, 16);
    } catch (err) {
      console.error("[billing] eth_blockNumber failed", opts.chain, err);
      return { kind: "none" };
    }
    if (!Number.isFinite(latest) || latest <= 0) return { kind: "none" };

    const created = opts.createdAt ? new Date(opts.createdAt).getTime() : Date.now() - PAY_EXPIRY_MS;
    const ageMs = Math.min(PAY_EXPIRY_MS, Math.max(60_000, Date.now() - created)) + 120_000;
    const maxBlocks = Math.ceil((PAY_EXPIRY_MS + 120_000) / 1000 / net.blockSeconds);
    const lookback = Math.min(Math.ceil(ageMs / 1000 / net.blockSeconds) + 40, maxBlocks);
    const fromBlock = Math.max(0, latest - lookback);

    const filter = {
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: "latest",
      address: net.usdc,
      topics: [TRANSFER_TOPIC0, null, padTopicAddress(opts.recipient)],
    };

    let logs: EvmLog[] = [];
    try {
      logs = await getLogs(opts.chain, filter);
    } catch (err) {
      console.error("[billing] eth_getLogs failed", opts.chain, err);
      return { kind: "none" };
    }
    if (logs.length === 0) return { kind: "none" };

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
  } catch (err) {
    console.error("[billing] evm match failed", opts.chain, err);
    return { kind: "none" };
  }
}
