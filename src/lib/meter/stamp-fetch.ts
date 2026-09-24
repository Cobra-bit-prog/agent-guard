import { createHash } from "node:crypto";
import { parsePartnerSlug } from "../partner.ts";
import { classifyMeterCaller, isExplicitMeterSmoke, isSmokeUserAgent } from "./origin.ts";
import type {
  MeterStore,
  RecordStampFetchInput,
  StampFetchResult,
  StampFetchRow,
  StampFetchSource,
} from "./store.ts";

/** Truncated sha256 hex. Full digest is 64; we keep 32 and never store the raw value. */
export const STAMP_FETCH_ORIGIN_HASH_LEN = 32;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function stampFetchOriginHash(request: Request): string | null {
  const origin = (request.headers.get("origin") ?? "").trim();
  const ua = (request.headers.get("user-agent") ?? "").trim();
  const material = origin || ua;
  if (!material) return null;
  return createHash("sha256").update(material).digest("hex").slice(0, STAMP_FETCH_ORIGIN_HASH_LEN);
}

/** Test, CI, and local-dev processes. Preview traffic is not included. */
export function isMeterTestCiDevEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "test" || nodeEnv === "development") return true;
  const ci = (env.CI ?? "").trim().toLowerCase();
  if (ci === "1" || ci === "true" || ci === "yes") return true;
  const vercel = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  return vercel === "development";
}

function requestHostname(request: Request): string | null {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Same smoke signals as meter invoices (X-Meter-Smoke, body source=smoke, probe UAs),
 * plus test/CI/dev. A matching fetch is stored with is_smoke=true and left out of
 * tickets_fetched_by_seller. Directory monitors are is_probe, not smoke.
 */
export function isStampFetchSmoke(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isExplicitMeterSmoke(request)) return true;
  if (isSmokeUserAgent(request.headers.get("user-agent"))) return true;
  if (isMeterTestCiDevEnv(env)) return true;
  const host = requestHostname(request);
  return host != null && LOCAL_HOSTS.has(host);
}

/** Directory/census UA. Smoke (including test/CI/dev) wins, so those rows stay is_probe=false. */
export function isStampFetchProbe(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isStampFetchSmoke(request, env)) return false;
  return classifyMeterCaller(request.headers.get("user-agent")) === "probe";
}

/** X-Seller, same slug rules as ?partner=. Invalid values are stored as null. */
export function sellerSlugFromRequest(request: Request): string | null {
  return parsePartnerSlug(request.headers.get("x-seller"));
}

export function summarizeStampFetches(rows: StampFetchRow[]): {
  tickets_fetched_by_seller: number;
  stamp_fetches_total: number;
  gate_demo_hits: number;
  fetch_unique_sellers: number;
  stamp_fetches_smoke: number;
} {
  const live = rows.filter((row) => !row.is_smoke && !row.is_probe);
  const sellers = new Set(
    live.map((row) => row.seller).filter((seller): seller is string => Boolean(seller)),
  );
  return {
    tickets_fetched_by_seller: live.filter(
      (row) => row.result === "allow" && row.source !== "gate_demo",
    ).length,
    stamp_fetches_total: live.length,
    gate_demo_hits: live.filter((row) => row.source === "gate_demo").length,
    fetch_unique_sellers: sellers.size,
    stamp_fetches_smoke: rows.filter((row) => row.is_smoke).length,
  };
}

export async function noteStampFetch(
  store: MeterStore,
  request: Request,
  fields: { stamp_id: string | null; source: StampFetchSource; result: StampFetchResult },
): Promise<void> {
  const row: RecordStampFetchInput = {
    stamp_id: fields.stamp_id,
    source: fields.source,
    result: fields.result,
    seller: sellerSlugFromRequest(request),
    origin_hash: stampFetchOriginHash(request),
    is_smoke: isStampFetchSmoke(request),
    is_probe: isStampFetchProbe(request),
  };
  try {
    await store.recordStampFetch(row);
  } catch (err) {
    console.error("[meter] stamp fetch record failed", err);
  }
}
