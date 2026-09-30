/** Agent Map — name, same shop, watch, miss slip. In-process store (v1). */

export const MAP_RESOLVE_USD = 0.01;
export const MAP_SAME_SHOP_USD = 0.1;
export const MAP_WATCH_USD = 0.2;
export const MAP_MISS_USD = 0.05;

type NameRow = { name: string; chain: string; address: string; url: string | null; updated_at: string };
type WatchRow = {
  watch_id: string;
  url: string | null;
  address: string | null;
  name: string | null;
  chain: string;
  last_address: string | null;
  last_live: boolean | null;
  hits: number;
  expires_at: string;
};
type SlipRow = {
  slip_id: string;
  url: string;
  pay_to: string;
  chain: string;
  amount_usd: number;
  paid_at: string;
  status: number | null;
  body_empty: boolean;
};

const names = new Map<string, NameRow>();
const watches = new Map<string, WatchRow>();
const slips = new Map<string, SlipRow>();
const clusters = new Map<string, string>();

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normName(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function normAddr(raw: unknown) {
  return String(raw ?? "").trim();
}

export function publishName(input: { name?: unknown; address?: unknown; chain?: unknown; url?: unknown }) {
  const name = normName(input.name);
  const address = normAddr(input.address);
  const chain = String(input.chain ?? "solana").toLowerCase();
  const url = input.url ? String(input.url).trim() : null;
  if (!name || !address) return { error: "Provide name and address.", http: 400 as const };
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(name)) {
    return { error: "Name must be a short handle (letters, numbers, dot, dash).", http: 400 as const };
  }
  const row: NameRow = { name, chain, address, url, updated_at: nowIso() };
  names.set(name, row);
  return { ok: true as const, ...row };
}

export function resolveName(name: unknown) {
  const key = normName(name);
  if (!key) return { error: "Provide name.", http: 400 as const };
  const row = names.get(key);
  if (!row) return { error: "unknown_name", name: key, http: 404 as const };
  return {
    question: "Where do I send it now?",
    name: row.name,
    chain: row.chain,
    address: row.address,
    url: row.url,
    updated_at: row.updated_at,
    price_usd: MAP_RESOLVE_USD,
  };
}

export function linkShop(addresses: string[], shopId?: string) {
  const shop = shopId || newId("shop");
  for (const a of addresses) {
    const addr = normAddr(a);
    if (addr) clusters.set(addr.toLowerCase(), shop);
  }
  return shop;
}

export function sameShop(a: unknown, b: unknown) {
  const left = normAddr(a);
  const right = normAddr(b);
  if (!left || !right) return { error: "Provide a and b.", http: 400 as const };
  if (left.toLowerCase() === right.toLowerCase()) {
    return {
      question: "Same shop?",
      a: left,
      b: right,
      same: true,
      reason: "same_address",
      shop_id: clusters.get(left.toLowerCase()) ?? null,
      price_usd: MAP_SAME_SHOP_USD,
    };
  }
  const sa = clusters.get(left.toLowerCase());
  const sb = clusters.get(right.toLowerCase());
  const same = Boolean(sa && sb && sa === sb);
  return {
    question: "Same shop?",
    a: left,
    b: right,
    same,
    reason: same ? "same_shop" : sa || sb ? "different_shop" : "unknown",
    shop_id: same ? sa : null,
    price_usd: MAP_SAME_SHOP_USD,
  };
}

export function startWatch(input: { url?: unknown; address?: unknown; name?: unknown; chain?: unknown }) {
  const url = String(input.url ?? "").trim();
  const address = normAddr(input.address);
  const name = input.name ? normName(input.name) : null;
  if (!url && !address && !name) return { error: "Provide url, address, or name.", http: 400 as const };
  const watch_id = newId("watch");
  const row: WatchRow = {
    watch_id,
    url: url || null,
    address: address || null,
    name,
    chain: String(input.chain ?? "solana").toLowerCase(),
    last_address: address || (name ? names.get(name)?.address ?? null : null),
    last_live: null,
    hits: 0,
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
  };
  watches.set(watch_id, row);
  return { ok: true as const, ...row, price_usd: MAP_WATCH_USD };
}

export function tickWatch(watchId: string, snapshot: { address?: unknown; live?: unknown; from?: unknown }) {
  const row = watches.get(watchId);
  if (!row) return { error: "unknown_watch", http: 404 as const };
  if (Date.parse(row.expires_at) <= Date.now()) return { error: "watch_expired", watch_id: watchId, http: 402 as const };
  const nextAddress = snapshot.address != null ? normAddr(snapshot.address) : row.last_address;
  const live = typeof snapshot.live === "boolean" ? snapshot.live : null;
  const moved = Boolean(nextAddress && row.last_address && nextAddress !== row.last_address);
  const died = row.last_live === true && live === false;
  const born = row.last_live === false && live === true;
  row.last_address = nextAddress || row.last_address;
  if (live != null) row.last_live = live;
  row.hits += 1;
  const events: Array<{ kind: string; from?: string | null; to?: string | null }> = [];
  if (moved) events.push({ kind: "pay_to_moved", from: typeof snapshot.from === "string" ? snapshot.from : row.last_address, to: nextAddress });
  if (died) events.push({ kind: "pay_path_dead" });
  if (born) events.push({ kind: "pay_path_live" });
  return {
    watch_id: watchId,
    changed: events.length > 0,
    events,
    last_address: row.last_address,
    last_live: row.last_live,
    expires_at: row.expires_at,
  };
}

export function issueMissSlip(input: {
  pay_to?: unknown;
  url?: unknown;
  amount_usd?: unknown;
  status?: unknown;
  body_empty?: unknown;
  body?: unknown;
  paid?: unknown;
  paid_at?: unknown;
  chain?: unknown;
}) {
  const pay_to = normAddr(input.pay_to);
  const url = String(input.url ?? "").trim();
  const amount_usd = Number(input.amount_usd);
  const status = Number(input.status);
  const body_empty = Boolean(input.body_empty ?? (input.body == null || input.body === ""));
  if (!pay_to || !url || !Number.isFinite(amount_usd)) {
    return { error: "Provide pay_to, url, and amount_usd.", http: 400 as const };
  }
  const paid = Boolean(input.paid);
  const got = paid && Number.isFinite(status) && status >= 200 && status < 300 && !body_empty;
  if (got) return { error: "This was delivered. No miss slip.", http: 400 as const };
  if (!paid) return { error: "No payment on file.", http: 400 as const };
  const slip_id = newId("slip");
  const row: SlipRow = {
    slip_id,
    url,
    pay_to,
    chain: String(input.chain ?? "solana").toLowerCase(),
    amount_usd,
    paid_at: typeof input.paid_at === "string" ? input.paid_at : nowIso(),
    status: Number.isFinite(status) ? status : null,
    body_empty,
  };
  slips.set(slip_id, row);
  return { question: "I paid. I got nothing.", price_usd: MAP_MISS_USD, ...row };
}

export function getSlip(slipId: string) {
  const row = slips.get(slipId);
  if (!row) return { error: "unknown_slip", http: 404 as const };
  return { question: "I paid. I got nothing.", price_usd: MAP_MISS_USD, ...row };
}

export function resetMapForTests() {
  names.clear();
  watches.clear();
  slips.clear();
  clusters.clear();
}
