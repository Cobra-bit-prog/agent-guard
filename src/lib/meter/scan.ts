import { isListedSink } from "./denylist.ts";
import { LOOK_QUESTION, LOOK_RISKS } from "./pricing.ts";

export type MeterChain = "solana" | "ethereum" | "base";
export type ScanRisk = (typeof LOOK_RISKS)[number];

export { LOOK_QUESTION, LOOK_RISKS };

export type ScanHistory = {
  first_seen_at: string | null;
  tx_count_in_window: number | null;
};

export function evaluateScan(input: {
  address: string;
  chain: MeterChain;
  nowMs?: number;
  history?: ScanHistory;
}): {
  address: string;
  chain: MeterChain;
  question: typeof LOOK_QUESTION;
  risk: ScanRisk;
  reason: string;
  first_seen_at: string | null;
  age_sec: number | null;
  tx_count_in_window: number | null;
} {
  const address = input.address.trim();
  const now = input.nowMs ?? Date.now();
  const history = input.history ?? { first_seen_at: null, tx_count_in_window: null };

  if (isListedSink(address)) {
    return {
      address,
      chain: input.chain,
      question: LOOK_QUESTION,
      risk: "sink",
      reason: "listed_sink Destination matches the meter sink list.",
      first_seen_at: history.first_seen_at,
      age_sec: ageSec(history.first_seen_at, now),
      tx_count_in_window: history.tx_count_in_window,
    };
  }

  if (!history.first_seen_at && (history.tx_count_in_window == null || history.tx_count_in_window === 0)) {
    return {
      address,
      chain: input.chain,
      question: LOOK_QUESTION,
      risk: "new",
      reason: "no_history No transfer history on file for this address.",
      first_seen_at: null,
      age_sec: null,
      tx_count_in_window: history.tx_count_in_window,
    };
  }

  const age = ageSec(history.first_seen_at, now);
  if (age != null && age < 15 * 60) {
    return {
      address,
      chain: input.chain,
      question: LOOK_QUESTION,
      risk: "new",
      reason: "fresh_address First seen within the last 15 minutes.",
      first_seen_at: history.first_seen_at,
      age_sec: age,
      tx_count_in_window: history.tx_count_in_window,
    };
  }

  if (history.tx_count_in_window != null && history.tx_count_in_window > 0 && history.tx_count_in_window < 3) {
    return {
      address,
      chain: input.chain,
      question: LOOK_QUESTION,
      risk: "warn",
      reason: "thin_history Fewer than 3 transfers on file.",
      first_seen_at: history.first_seen_at,
      age_sec: age,
      tx_count_in_window: history.tx_count_in_window,
    };
  }

  return {
    address,
    chain: input.chain,
    question: LOOK_QUESTION,
    risk: "ok",
    reason: "ok Address is not on the sink list and has history.",
    first_seen_at: history.first_seen_at,
    age_sec: age,
    tx_count_in_window: history.tx_count_in_window,
  };
}

function ageSec(firstSeen: string | null, nowMs: number): number | null {
  if (!firstSeen) return null;
  const t = Date.parse(firstSeen);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}
