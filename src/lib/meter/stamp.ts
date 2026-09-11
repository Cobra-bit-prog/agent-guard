import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { STAMP_TICKET_COPY } from "./pricing.ts";

const globalRef = globalThis as typeof globalThis & { __meterStampSecret__?: string };

/**
 * HMAC key for Agent Meter stamps. Reuses existing app secrets — no new env var.
 *
 * Lookup order:
 * 1. INTERNAL_STATS_SECRET (already used for GET /meter/report)
 * 2. BETTER_AUTH_SECRET
 * 3. SHA-256 of the Vercel deploy seed (same pattern as auth)
 * 4. Process-local random bytes (tests / ephemeral preview)
 */
export function meterStampSecret(env = process.env): string {
  const stats = env.INTERNAL_STATS_SECRET?.trim();
  if (stats) return stats;
  const auth = env.BETTER_AUTH_SECRET?.trim();
  if (auth) return auth;
  const seed = env.VERCEL_GIT_COMMIT_SHA?.trim() || env.VERCEL_DEPLOYMENT_ID?.trim();
  if (seed) return createHash("sha256").update(`agent-meter-stamp:${seed}`).digest("hex");
  globalRef.__meterStampSecret__ ??= randomBytes(32).toString("hex");
  return globalRef.__meterStampSecret__;
}

export type StampDecision = "allow" | "stop";

export type StampPayload = {
  stamp_id: string;
  decision: StampDecision;
  chain: string;
  wallet: string | null;
  address: string | null;
  value_usd: number | null;
  pass_id: string;
  created_at: string;
};

export function stampCanonical(payload: StampPayload): string {
  return [
    payload.stamp_id,
    payload.decision,
    payload.chain,
    payload.wallet ?? "",
    payload.address ?? "",
    payload.value_usd == null ? "" : String(payload.value_usd),
    payload.pass_id,
    payload.created_at,
  ].join("|");
}

export function signStamp(payload: StampPayload, secret = meterStampSecret()): string {
  return createHmac("sha256", secret).update(stampCanonical(payload)).digest("hex");
}

export function stampHmacValid(
  payload: StampPayload,
  hmac: string,
  secret = meterStampSecret(),
): boolean {
  const expected = signStamp(payload, secret);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(hmac, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function publicStampView(
  payload: StampPayload,
  hmac: string,
): StampPayload & {
  hmac: string;
  alg: "HMAC-SHA256";
  verified: boolean;
  ticket: typeof STAMP_TICKET_COPY;
  price_usd: 0.05;
} {
  return {
    ...payload,
    hmac,
    alg: "HMAC-SHA256",
    verified: stampHmacValid(payload, hmac),
    ticket: STAMP_TICKET_COPY,
    price_usd: 0.05,
  };
}

export { STAMP_TICKET_COPY };
