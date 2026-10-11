import type { ListingQuery } from "../directory/listings.ts";
import type { MerchantLook, SearchLook, ValidateLook } from "./checks.ts";

/** Public, keyless Coinbase Bazaar routes. Confirmed to answer without an API key. */
export const CDP_MERCHANT_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant";
export const CDP_SEARCH_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search";
export const CDP_VALIDATE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/validate";
export const MCP_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers";

export type RemoteFetch = (
  url: string,
  init?: { method?: string; body?: string },
) => Promise<{ status: number; body: string }>;

const REMOTE_TIMEOUT_MS = 8_000;

export async function defaultRemoteFetch(
  url: string,
  init?: { method?: string; body?: string },
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/json",
      "user-agent": "AgentControl-x402-check/1.0",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body,
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    redirect: "error",
  });
  const body = await response.text();
  return { status: response.status, body: body.slice(0, 200_000) };
}

function readJson(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resourceUrls(json: Record<string, unknown> | null): string[] {
  const resources = json?.resources;
  if (!Array.isArray(resources)) return [];
  const urls: string[] = [];
  for (const item of resources) {
    if (!item || typeof item !== "object") continue;
    const resource = (item as { resource?: unknown }).resource;
    if (typeof resource === "string" && resource) urls.push(resource);
  }
  return urls;
}

export async function lookupMerchant(payTo: string, remote: RemoteFetch): Promise<MerchantLook> {
  const url = new URL(CDP_MERCHANT_URL);
  url.searchParams.set("payTo", payTo);
  url.searchParams.set("limit", "20");
  try {
    const response = await remote(url.href);
    if (response.status !== 200) return { payTo, state: "error", resources: [] };
    const json = readJson(response.body);
    if (!json || !Array.isArray(json.resources)) return { payTo, state: "error", resources: [] };
    return { payTo, state: "ok", resources: resourceUrls(json) };
  } catch {
    return { payTo, state: "error", resources: [] };
  }
}

export async function lookupSearch(
  query: string,
  payTo: string | null,
  curatedOnly: boolean,
  remote: RemoteFetch,
): Promise<SearchLook> {
  const url = new URL(CDP_SEARCH_URL);
  url.searchParams.set("query", query.slice(0, 300));
  url.searchParams.set("limit", "20");
  url.searchParams.set("curatedOnly", curatedOnly ? "true" : "false");
  if (payTo) url.searchParams.set("payTo", payTo);
  try {
    const response = await remote(url.href);
    if (response.status !== 200) return { curatedOnly, state: "error", partial: false, resources: [] };
    const json = readJson(response.body);
    if (!json || !Array.isArray(json.resources)) {
      return { curatedOnly, state: "error", partial: false, resources: [] };
    }
    return {
      curatedOnly,
      state: "ok",
      partial: json.partialResults === true,
      resources: resourceUrls(json),
    };
  } catch {
    return { curatedOnly, state: "error", partial: false, resources: [] };
  }
}

export async function lookupValidate(resource: string, method: string, remote: RemoteFetch): Promise<ValidateLook> {
  try {
    const response = await remote(CDP_VALIDATE_URL, {
      method: "POST",
      body: JSON.stringify({ resource, method }),
    });
    if (response.status !== 200) return { state: "error" };
    const json = readJson(response.body);
    if (!json || typeof json.valid !== "boolean") return { state: "error" };
    const simulation = json.simulation;
    const outcome =
      simulation && typeof simulation === "object" && typeof (simulation as { outcome?: unknown }).outcome === "string"
        ? (simulation as { outcome: string }).outcome
        : null;
    const failed: string[] = [];
    if (Array.isArray(json.preflight)) {
      for (const item of json.preflight) {
        if (!item || typeof item !== "object") continue;
        const row = item as { passed?: unknown; detail?: unknown; severity?: unknown };
        if (row.passed === false && row.severity === "required" && typeof row.detail === "string") {
          failed.push(row.detail);
        }
      }
    }
    return { state: "ok", valid: json.valid, outcome, failed };
  } catch {
    return { state: "error" };
  }
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function lookupDirectory(
  sql: ListingQuery,
  host: string,
  payTos: string[],
): Promise<{ names: string[] } | null> {
  const hostPattern = host ? likePattern(host) : "";
  const payPattern = payTos[0] ? likePattern(payTos[0]) : "";
  if (!hostPattern && !payPattern) return { names: [] };
  try {
    const rows = await sql.query<{ name: string }>(
      `select name from agent_listings
       where hidden_at is null
         and (
           ($1::text <> '' and link ilike $1 escape '\\')
           or ($2::text <> '' and (link ilike $2 escape '\\' or contact ilike $2 escape '\\'))
         )
       limit 5`,
      [hostPattern, payPattern],
    );
    return { names: rows.map((row) => row.name) };
  } catch {
    return null;
  }
}

function registryListed(json: Record<string, unknown> | null, host: string): boolean | null {
  if (!json || !Array.isArray(json.servers)) return null;
  const needle = host.toLowerCase();
  if (!needle) return false;
  for (const item of json.servers) {
    const blob = JSON.stringify(item).toLowerCase();
    if (blob.includes(needle)) return true;
  }
  return false;
}

export async function lookupRegistry(host: string, remote: RemoteFetch): Promise<{ listed: boolean } | null> {
  if (!host) return { listed: false };
  const url = new URL(MCP_REGISTRY_URL);
  url.searchParams.set("search", host);
  url.searchParams.set("limit", "20");
  try {
    const response = await remote(url.href);
    if (response.status !== 200) return null;
    const listed = registryListed(readJson(response.body), host);
    if (listed == null) return null;
    return { listed };
  } catch {
    return null;
  }
}
