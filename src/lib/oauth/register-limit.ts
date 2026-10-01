/**
 * In-process rate limit for unauthenticated POST /oauth/register.
 *
 * Public Dynamic Client Registration stays enabled so Claude Connectors can
 * register. Every attempt counts, including bodies that will be rejected.
 *
 * Key: client IP. On Vercel the platform sets `X-Forwarded-For` and the first
 * hop is the visitor (clients cannot spoof it in front of Vercel). `X-Real-IP`
 * is the fallback. If both are missing, attempts share one `unknown` bucket so
 * a header-less flood still trips the limit.
 *
 * Cap: {@link REGISTER_RATE_MAX} attempts per {@link REGISTER_RATE_WINDOW_MS}
 * (30 per 10 minutes) per key.
 *
 * Scope: the counters live in memory on one server instance. Vercel isolates
 * do not share the map, so this is a per-instance brake, not a global quota.
 * That is enough to blunt a tight registration loop without a shared store.
 *
 * Claude's registration calls come from Anthropic egress (160.79.104.0/21) and
 * many connectors can share one of those addresses. Thirty per ten minutes per
 * address per isolate leaves room for ordinary connector setup.
 *
 * Over the limit the route returns HTTP 429 with `Retry-After` (seconds until
 * the oldest counted attempt leaves the window) and
 * `{ "error": "slow_down" }`.
 */

export const REGISTER_RATE_MAX = 30;
export const REGISTER_RATE_WINDOW_MS = 10 * 60 * 1000;

export type RegisterLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type LimitOpts = {
  max?: number;
  windowMs?: number;
  buckets?: Map<string, number[]>;
};

const buckets = new Map<string, number[]>();

export function clientIpForRegisterLimit(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 128);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

export function consumeRegisterSlot(
  key: string,
  now = Date.now(),
  opts?: LimitOpts,
): RegisterLimitResult {
  const max = opts?.max ?? REGISTER_RATE_MAX;
  const windowMs = opts?.windowMs ?? REGISTER_RATE_WINDOW_MS;
  const store = opts?.buckets ?? buckets;
  const fresh = (store.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (fresh.length >= max) {
    const oldest = fresh[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    store.set(key, fresh);
    return { ok: false, retryAfterSec };
  }
  fresh.push(now);
  store.set(key, fresh);
  return { ok: true };
}
