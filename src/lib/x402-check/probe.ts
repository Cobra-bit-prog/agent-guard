import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { assertPublicAddresses, parsePublicHttpsUrl, resolveRedirect, SsrfError } from "./ssrf.ts";

/** IPv4 first. Some hosts publish IPv6 that this runtime cannot reach. */
export function orderAddresses(addresses: readonly string[]): string[] {
  const v4: string[] = [];
  const v6: string[] = [];
  for (const address of addresses) {
    if (isIP(address) === 6) v6.push(address);
    else v4.push(address);
  }
  return [...v4, ...v6];
}

/** Node's HTTP client asks for `options.all`, which expects an address list. */
export function pinLookup(ip: string): LookupFunction {
  const family = ip.includes(":") ? 6 : 4;
  return (_hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts: LookupOptions = typeof options === "function" || !options ? {} : options;
    if (opts.all) {
      const addresses: LookupAddress[] = [{ address: ip, family }];
      cb(null, addresses);
      return;
    }
    cb(null, ip, family);
  };
}

export const MAX_REDIRECTS = 2;
export const MAX_BODY_BYTES = 64 * 1024;
export const REQUEST_TIMEOUT_MS = 8_000;

export type LookupFn = (hostname: string) => Promise<string[]>;

export type ProbeHop = {
  status: number;
  headers: { get(name: string): string | null };
  body: Uint8Array;
};

export type ProbeTransport = (input: {
  url: URL;
  ip: string;
  method: "GET" | "POST";
  body?: string;
}) => Promise<ProbeHop>;

export type EndpointProbe = {
  ok: true;
  status: number;
  contentType: string;
  finalUrl: string;
  method: "GET" | "POST";
  route: "payment" | "mcp" | "other";
  headerRaw: string | null;
  bodyText: string;
  payment: unknown | null;
  paymentSource: "header" | "body" | null;
  decodeError: string | null;
};

export async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
}

function headerMap(headers: NodeJS.Dict<string | string[] | undefined>): { get(name: string): string | null } {
  return {
    get(name: string) {
      const value = headers[name.toLowerCase()];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

export function defaultTransport(input: {
  url: URL;
  ip: string;
  method: "GET" | "POST";
  body?: string;
}): Promise<ProbeHop> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: "https:",
        hostname: input.url.hostname,
        servername: input.url.hostname,
        port: 443,
        path: `${input.url.pathname}${input.url.search}`,
        method: input.method,
        headers: {
          accept: "application/json",
          host: input.url.host,
          "user-agent": "AgentControl-x402-check/1.0",
          ...(input.body
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(input.body),
              }
            : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
        lookup: pinLookup(input.ip) as LookupFunction,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy(new SsrfError("The reply was too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: headerMap(res.headers),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new SsrfError("The endpoint did not answer in time."));
    });
    req.on("error", (err) => {
      if (err instanceof SsrfError) reject(err);
      else reject(new SsrfError("The endpoint did not answer."));
    });
    if (input.body) req.write(input.body);
    req.end();
  });
}

function decodePayment(headerRaw: string | null, bodyText: string, status: number): {
  payment: unknown | null;
  source: "header" | "body" | null;
  error: string | null;
} {
  if (headerRaw?.trim()) {
    try {
      const json = Buffer.from(headerRaw.trim(), "base64").toString("utf8");
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object") return { payment: parsed, source: "header", error: null };
    } catch {
      /* try the body */
    }
  }
  if (status !== 402) return { payment: null, source: null, error: null };
  if (bodyText.trim()) {
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object") return { payment: parsed, source: "body", error: null };
    } catch {
      return { payment: null, source: null, error: "The 402 body is not JSON." };
    }
  }
  return { payment: null, source: null, error: "No payment requirement in the header or the body." };
}

function hopBody(hop: ProbeHop): string {
  return Buffer.from(hop.body).toString("utf8").slice(0, 8000).toLowerCase();
}

/** A non-402 reply that is an MCP server, not a payment route. */
export function isMcpHop(url: URL, hop: ProbeHop): boolean {
  if (hop.status === 402) return false;
  if (hop.headers.get("payment-required")?.trim()) return false;
  const body = hopBody(hop);
  if (body.includes("\"x402version\"")) return false;
  const ctype = (hop.headers.get("content-type") ?? "").toLowerCase();
  if (ctype.includes("text/event-stream")) return true;
  if (body.includes("\"jsonrpc\"") || body.includes("\"protocolversion\"") || body.includes("\"serverinfo\"")) return true;
  const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const mcpPath = path === "/mcp" || path.endsWith("/mcp");
  return mcpPath && (hop.status === 200 || hop.status === 400 || hop.status === 405 || hop.status === 406);
}

async function pinnedAddresses(url: URL, lookup: LookupFn): Promise<string[]> {
  const addresses = orderAddresses(await lookup(url.hostname));
  assertPublicAddresses(addresses);
  if (addresses.length === 0) throw new SsrfError("That host is not a public address.");
  return addresses;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

async function oneHop(
  start: URL,
  method: "GET" | "POST",
  body: string | undefined,
  lookup: LookupFn,
  transport: ProbeTransport,
): Promise<{ finalUrl: URL; hop: ProbeHop }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const addresses = await pinnedAddresses(current, lookup);
    let response: ProbeHop | null = null;
    let lastError: unknown = null;
    for (const ip of addresses) {
      try {
        response = await transport({
          url: current,
          ip,
          method: hop === 0 ? method : "GET",
          body: hop === 0 ? body : undefined,
        });
        break;
      } catch (err) {
        if (err instanceof SsrfError && err.message !== "The endpoint did not answer.") throw err;
        lastError = err;
      }
    }
    if (!response) throw lastError instanceof SsrfError ? lastError : new SsrfError("The endpoint did not answer.");
    if (!REDIRECT.has(response.status)) return { finalUrl: current, hop: response };
    const location = response.headers.get("location");
    if (!location) throw new SsrfError("The redirect is not a public https URL.");
    if (hop === MAX_REDIRECTS) throw new SsrfError("Too many redirects.");
    current = resolveRedirect(current, location);
  }
  throw new SsrfError("Too many redirects.");
}

function finishProbe(
  result: { finalUrl: URL; hop: ProbeHop },
  method: "GET" | "POST",
  route: EndpointProbe["route"],
): EndpointProbe {
  const bodyText = Buffer.from(result.hop.body).toString("utf8");
  const headerRaw = result.hop.headers.get("payment-required");
  const decoded = decodePayment(headerRaw, bodyText, result.hop.status);
  const paymentRoute = result.hop.status === 402 && decoded.payment ? "payment" : route;
  return {
    ok: true,
    status: result.hop.status,
    contentType: result.hop.headers.get("content-type") ?? "",
    finalUrl: result.finalUrl.href,
    method,
    route: paymentRoute,
    headerRaw,
    bodyText,
    payment: decoded.payment,
    paymentSource: decoded.source,
    decodeError: decoded.error,
  };
}

/** GET the endpoint the way a buyer would. One POST with an empty JSON body if GET is not 402. */
export async function probeEndpoint(
  rawUrl: string,
  deps: { lookup?: LookupFn; transport?: ProbeTransport } = {},
): Promise<EndpointProbe> {
  const lookup = deps.lookup ?? defaultLookup;
  const transport = deps.transport ?? defaultTransport;
  const start = parsePublicHttpsUrl(rawUrl);
  const getResult = await oneHop(start, "GET", undefined, lookup, transport);
  if (getResult.hop.status === 402) return finishProbe(getResult, "GET", "payment");
  const postResult = await oneHop(getResult.finalUrl, "POST", "{}", lookup, transport);
  if (postResult.hop.status === 402) return finishProbe(postResult, "POST", "payment");
  if (isMcpHop(getResult.finalUrl, getResult.hop)) return finishProbe(getResult, "GET", "mcp");
  if (isMcpHop(postResult.finalUrl, postResult.hop)) return finishProbe(postResult, "POST", "mcp");
  return finishProbe(postResult, "POST", "other");
}

/** One request, no second method. Used to replay a Bazaar example. Same SSRF rules as the probe. */
export async function probeExchange(
  rawUrl: string,
  method: "GET" | "POST",
  body: string | undefined,
  deps: { lookup?: LookupFn; transport?: ProbeTransport } = {},
): Promise<{ status: number; finalUrl: string }> {
  const lookup = deps.lookup ?? defaultLookup;
  const transport = deps.transport ?? defaultTransport;
  const start = parsePublicHttpsUrl(rawUrl);
  const result = await oneHop(start, method, method === "POST" ? body : undefined, lookup, transport);
  return { status: result.hop.status, finalUrl: result.finalUrl.href };
}
