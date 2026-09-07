import {
  matchUsdcByReference,
  type MatchResult,
  type ParsedTx,
} from "@/lib/pay-invoice";
import {
  SOLANA_PAYOUT_ADDRESS,
  lockedSolanaUsdcRecipient,
} from "@/lib/solana-pay";
import { rpc, solanaRpcUrl } from "@/lib/onchain";

export { newPayReference } from "@/lib/pay-invoice";

/**
 * Always the production Phantom pubkey (same value as Vercel Production
 * SOLANA_PAYOUT_ADDRESS). Env mismatches are logged and ignored so a wrong
 * Vercel preview env cannot retarget funds.
 */
export function payoutAddress(): string {
  const fromEnv = process.env.SOLANA_PAYOUT_ADDRESS?.trim();
  if (fromEnv && fromEnv !== SOLANA_PAYOUT_ADDRESS) {
    console.error(
      "[billing] SOLANA_PAYOUT_ADDRESS must be",
      SOLANA_PAYOUT_ADDRESS,
      "(Vercel Production). Ignoring override.",
    );
  }
  return lockedSolanaUsdcRecipient(fromEnv);
}

export function checkoutConfigured(): boolean {
  return Boolean(payoutAddress());
}

export type { MatchResult };

export async function findMatchingUsdcPayment(opts: {
  reference: string;
  recipient: string;
  amountUsdc: number;
}): Promise<MatchResult> {
  const endpoint = solanaRpcUrl();
  type Sig = { signature: string; err?: unknown };
  const sigs = await rpc<Sig[]>(endpoint, "getSignaturesForAddress", [
    opts.reference,
    { limit: 8 },
  ]);
  if (!Array.isArray(sigs) || sigs.length === 0) return { kind: "none" };

  const packed: Array<{ signature: string; err?: unknown; tx?: ParsedTx | null }> = [];
  for (const s of sigs) {
    if (s.err) continue;
    try {
      const tx = await rpc<ParsedTx>(endpoint, "getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      packed.push({ signature: s.signature, err: s.err, tx });
    } catch (err) {
      console.error("[billing] getTransaction failed", s.signature, err);
    }
  }
  return matchUsdcByReference({
    recipient: payoutAddress(),
    amountUsdc: opts.amountUsdc,
    signatures: packed,
  });
}
