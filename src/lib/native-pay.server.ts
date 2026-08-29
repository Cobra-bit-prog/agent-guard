import { PAY_EXPIRY_MS } from "@/lib/solana-pay";
import { rpc, solanaRpcUrl } from "@/lib/onchain";

export type NativeMatch =
  | { kind: "none" }
  | { kind: "paid"; signature: string; amountUsdc: number }
  | { kind: "underpaid"; signature: string; amountUsdc: number };

function randomExtra(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1 + (buf[0] % 9_999);
}

/** usd / price, in base units, plus a unique extra of 1..9999. */
export function allocateUniqueNativeAmount(
  usedBaseUnits: Iterable<string>,
  usd: number,
  priceUsd: number,
  decimals: number,
): string {
  if (!(priceUsd > 0) || !(usd > 0)) throw new Error("Could not price this payment. Try USDC.");
  const priceMicros = BigInt(Math.round(priceUsd * 1e6));
  if (priceMicros <= 0n) throw new Error("Could not price this payment. Try USDC.");
  const usdMicros = BigInt(usd) * 1_000_000n;
  const scale = 10n ** BigInt(decimals);
  const base = (usdMicros * scale) / priceMicros;
  if (base <= 0n) throw new Error("Could not price this payment. Try USDC.");
  const taken = new Set(usedBaseUnits);
  for (let i = 0; i < 64; i += 1) {
    const amount = String(base + BigInt(randomExtra()));
    if (!taken.has(amount)) return amount;
  }
  throw new Error("Could not allocate a unique amount. Try again.");
}

export async function quoteSolEthUsd(): Promise<{ sol: number; eth: number }> {
  try {
    const [solRes, ethRes] = await Promise.all([
      fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", {
        signal: AbortSignal.timeout(2500),
      }),
      fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", {
        signal: AbortSignal.timeout(2500),
      }),
    ]);
    const solJ = (await solRes.json()) as { price?: string };
    const ethJ = (await ethRes.json()) as { price?: string };
    const sol = Number(solJ.price);
    const eth = Number(ethJ.price);
    if (sol > 0 && eth > 0) return { sol, eth };
  } catch {
    /* CoinGecko next */
  }
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd",
    { signal: AbortSignal.timeout(2500) },
  );
  const j = (await res.json()) as { solana?: { usd?: number }; ethereum?: { usd?: number } };
  const sol = Number(j.solana?.usd);
  const eth = Number(j.ethereum?.usd);
  if (sol > 0 && eth > 0) return { sol, eth };
  throw new Error("Could not get a SOL or ETH price. Pay with USDC instead.");
}

type SolSig = { signature: string; err?: unknown };
type SolTx = {
  meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[] };
  transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } };
};

function accountKeys(tx: SolTx | null | undefined): string[] {
  return (tx?.transaction?.message?.accountKeys ?? []).map((k) =>
    typeof k === "string" ? k : String(k.pubkey ?? ""),
  );
}

async function solLamportDelta(signature: string, owner: string): Promise<bigint | null> {
  const endpoint = solanaRpcUrl();
  const tx = await rpc<SolTx>(endpoint, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx || tx.meta?.err) return null;
  const keys = accountKeys(tx);
  const idx = keys.findIndex((k) => k === owner);
  if (idx < 0) return null;
  const pre = BigInt(tx.meta?.preBalances?.[idx] ?? 0);
  const post = BigInt(tx.meta?.postBalances?.[idx] ?? 0);
  return post - pre;
}

export async function findMatchingNativeSolPayment(opts: {
  recipient: string;
  amountBaseUnits: string;
  reference: string;
  planPriceUsdc: number;
}): Promise<NativeMatch> {
  const expected = BigInt(opts.amountBaseUnits);
  if (expected <= 0n) return { kind: "none" };
  const endpoint = solanaRpcUrl();
  const keys = [opts.reference, opts.recipient].filter(Boolean);
  let bestUnder: NativeMatch | null = null;
  for (const key of keys) {
    let sigs: SolSig[] = [];
    try {
      sigs = await rpc<SolSig[]>(endpoint, "getSignaturesForAddress", [key, { limit: 12 }]);
    } catch (err) {
      console.error("[billing] SOL getSignaturesForAddress failed", err);
      continue;
    }
    if (!Array.isArray(sigs)) continue;
    for (const s of sigs) {
      if (s.err) continue;
      try {
        const delta = await solLamportDelta(s.signature, opts.recipient);
        if (delta == null || delta <= 0n) continue;
        if (delta >= expected) {
          return { kind: "paid", signature: s.signature, amountUsdc: opts.planPriceUsdc };
        }
        bestUnder = {
          kind: "underpaid",
          signature: s.signature,
          amountUsdc: 0,
        };
      } catch (err) {
        console.error("[billing] SOL getTransaction failed", s.signature, err);
      }
    }
  }
  return bestUnder ?? { kind: "none" };
}

export async function findMatchingNativeEthPayment(opts: {
  recipient: string;
  amountBaseUnits: string;
  planPriceUsdc: number;
}): Promise<NativeMatch> {
  const expected = BigInt(opts.amountBaseUnits);
  if (expected <= 0n) return { kind: "none" };
  const to = opts.recipient.toLowerCase();
  const url = `https://eth.blockscout.com/api?module=account&action=txlist&address=${opts.recipient}&page=1&offset=25&sort=desc`;
  let rows: Array<{
    hash?: string;
    to?: string;
    value?: string;
    isError?: string;
    input?: string;
  }> = [];
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const j = (await res.json()) as { result?: typeof rows };
    rows = Array.isArray(j.result) ? j.result : [];
  } catch (err) {
    console.error("[billing] ETH txlist failed", err);
    return { kind: "none" };
  }
  let bestUnder: NativeMatch | null = null;
  for (const tx of rows) {
    if (!tx.hash) continue;
    if ((tx.to ?? "").toLowerCase() !== to) continue;
    if (tx.isError === "1") continue;
    const input = (tx.input ?? "0x").toLowerCase();
    if (input !== "0x" && input !== "0x0" && input !== "") continue;
    let value = 0n;
    try {
      value = BigInt(tx.value ?? "0");
    } catch {
      continue;
    }
    if (value <= 0n) continue;
    if (value >= expected) {
      return { kind: "paid", signature: tx.hash, amountUsdc: opts.planPriceUsdc };
    }
    bestUnder = { kind: "underpaid", signature: tx.hash, amountUsdc: 0 };
  }
  return bestUnder ?? { kind: "none" };
}
