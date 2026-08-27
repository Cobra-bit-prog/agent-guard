import { USDC_MINT, usdcBaseUnits } from "@/lib/solana-pay";
import { isSolanaAddress } from "@/lib/chains";
import { rpc, solanaRpcUrl } from "@/lib/onchain";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}

/** Random 32-byte Solana Pay reference pubkey (does not need to be on-curve). */
export function newPayReference(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase58(bytes);
}

export function payoutAddress(): string | null {
  const value = process.env.SOLANA_PAYOUT_ADDRESS?.trim();
  if (!value) return null;
  if (!isSolanaAddress(value)) {
    console.error("[billing] SOLANA_PAYOUT_ADDRESS is not a valid Solana pubkey");
    return null;
  }
  return value;
}

export function checkoutConfigured(): boolean {
  return Boolean(payoutAddress());
}

type TokenBal = {
  mint?: string;
  owner?: string;
  uiTokenAmount?: { amount?: string; uiAmount?: number | null };
};

type ParsedTx = {
  meta?: {
    err?: unknown;
    preTokenBalances?: TokenBal[];
    postTokenBalances?: TokenBal[];
  };
};

function tokenDelta(tx: ParsedTx, owner: string): bigint {
  const mint = USDC_MINT;
  const sum = (rows: TokenBal[] | undefined) =>
    (rows ?? []).reduce((acc, row) => {
      if (row.mint !== mint) return acc;
      if (row.owner && row.owner !== owner) return acc;
      const amt = row.uiTokenAmount?.amount;
      if (!amt) return acc;
      try {
        return acc + BigInt(amt);
      } catch {
        return acc;
      }
    }, 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

export type MatchResult =
  | { kind: "none" }
  | { kind: "paid"; signature: string; amountUsdc: number }
  | { kind: "underpaid"; signature: string; amountUsdc: number };

export async function findMatchingUsdcPayment(opts: {
  reference: string;
  recipient: string;
  amountUsdc: number;
}): Promise<MatchResult> {
  const endpoint = solanaRpcUrl();
  const expected = BigInt(usdcBaseUnits(opts.amountUsdc));
  type Sig = { signature: string; err?: unknown };
  const sigs = await rpc<Sig[]>(endpoint, "getSignaturesForAddress", [
    opts.reference,
    { limit: 8 },
  ]);
  if (!Array.isArray(sigs) || sigs.length === 0) return { kind: "none" };

  let bestUnder: MatchResult | null = null;
  for (const s of sigs) {
    if (s.err) continue;
    try {
      const tx = await rpc<ParsedTx>(endpoint, "getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx || tx.meta?.err) continue;
      const delta = tokenDelta(tx, opts.recipient);
      if (delta <= 0n) continue;
      const amountUsdc = Number(delta) / 1e6;
      if (delta >= expected) {
        return { kind: "paid", signature: s.signature, amountUsdc };
      }
      bestUnder = { kind: "underpaid", signature: s.signature, amountUsdc };
    } catch (err) {
      console.error("[billing] getTransaction failed", s.signature, err);
    }
  }
  return bestUnder ?? { kind: "none" };
}
