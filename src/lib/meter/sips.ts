import { evaluateScan, type MeterChain, type ScanRisk } from "./scan.ts";
import { evaluatePreflightSelf } from "./preflight.ts";

/** Bound pass: the token sets the cap. Agent cannot raise it in the body. */
export const BOUND_PER_SEND_USD = 2;
export const BOUND_DAY_USD = 20;
export const JOB_USD = 1;

export const DEFAULT_ALLOW_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.x.ai",
  "api.coinbase.com",
  "facilitator.payai.network",
  "payapi.market",
] as const;

export function compareAddresses(input: {
  a: string;
  b: string;
  chain: MeterChain;
}): {
  question: string;
  a: { address: string; risk: ScanRisk; reason: string };
  b: { address: string; risk: ScanRisk; reason: string };
  pick: "a" | "b" | "neither";
} {
  const a = evaluateScan({ address: input.a, chain: input.chain });
  const b = evaluateScan({ address: input.b, chain: input.chain });
  const rank: Record<ScanRisk, number> = { ok: 0, warn: 1, new: 2, sink: 3 };
  let pick: "a" | "b" | "neither" = "neither";
  if (a.risk === "sink" && b.risk === "sink") pick = "neither";
  else if (a.risk === "sink") pick = "b";
  else if (b.risk === "sink") pick = "a";
  else if (rank[a.risk] < rank[b.risk]) pick = "a";
  else if (rank[b.risk] < rank[a.risk]) pick = "b";
  else pick = "a";
  return {
    question: "Which address is safer to pay?",
    a: { address: a.address, risk: a.risk, reason: a.reason },
    b: { address: b.address, risk: b.risk, reason: b.reason },
    pick,
  };
}

export function hostOnAllowList(host: string, list: readonly string[] = DEFAULT_ALLOW_HOSTS): boolean {
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  return list.some((row) => h === row || h.endsWith(`.${row}`));
}

export function evaluatePing(input: {
  url: string;
  status: number | null;
  ok: boolean;
}): {
  url: string;
  live: boolean;
  status: number | null;
  reason: string;
} {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { url, live: false, status: null, reason: "url_must_be_http" };
  }
  if (input.status === 402) {
    return { url, live: true, status: 402, reason: "pay_request_live" };
  }
  if (input.ok && input.status != null && input.status < 500) {
    return { url, live: true, status: input.status, reason: "reachable" };
  }
  return { url, live: false, status: input.status, reason: "dead_or_error" };
}

export function boundPreflight(input: {
  value_usd: number;
  spent_today_usd: number;
}): ReturnType<typeof evaluatePreflightSelf> & { bound: true; bound_per_send_usd: number; bound_day_usd: number } {
  const cap = BOUND_DAY_USD;
  const per = evaluatePreflightSelf({
    cap_usd: cap,
    value_usd: input.value_usd,
    spent_today_usd: input.spent_today_usd,
  });
  if (input.value_usd > BOUND_PER_SEND_USD) {
    return {
      ...evaluatePreflightSelf({
        cap_usd: BOUND_PER_SEND_USD,
        value_usd: input.value_usd,
        spent_today_usd: 0,
      }),
      bound: true,
      bound_per_send_usd: BOUND_PER_SEND_USD,
      bound_day_usd: BOUND_DAY_USD,
      reason: "over_bound_send value exceeds the bound pass per-send limit.",
    };
  }
  return {
    ...per,
    bound: true,
    bound_per_send_usd: BOUND_PER_SEND_USD,
    bound_day_usd: BOUND_DAY_USD,
  };
}

const seenCounts = new Map<string, number>();

export function noteSeen(chain: string, address: string): number {
  const key = `${chain}:${address.trim().toLowerCase()}`;
  const next = (seenCounts.get(key) ?? 0) + 1;
  seenCounts.set(key, next);
  return next;
}

export function seenCount(chain: string, address: string): number {
  return seenCounts.get(`${chain}:${address.trim().toLowerCase()}`) ?? 0;
}

export function resetSeenForTests() {
  seenCounts.clear();
}

export function debitJob(remaining_usd: number, cost_usd: number): {
  remaining_usd: number;
  stop: boolean;
} {
  const left = Number((remaining_usd - cost_usd).toFixed(6));
  return { remaining_usd: Math.max(0, left), stop: left < 0 || remaining_usd < cost_usd };
}
