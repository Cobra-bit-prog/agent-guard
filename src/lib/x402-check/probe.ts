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
/** Read past Node's 16 KB header cap so a too-big PAYMENT-REQUIRED header can be measured. */
export const HEADER_READ_MAX = 256 * 1024;

export type LookupFn = (hostname: string) => Promise<string[]>;

export type ProbeHop = {
  status: number;
  headers: { get(name: string): string | null };
  body: Uint8Array;
  truncated?: boolean;
  /** Byte length of the PAYMENT-REQUIRED header value. Null when that header is absent. */
  paymentRequiredBytes?: number | null;
  /** Byte length of the response header field lines (`name: value\\r\\n`). */
  responseHeaderBytes?: number | null;
  /** The parser stopped because the header block was larger than HEADER_READ_MAX. */
  headersOverflow?: boolean;
};

/** Byte length of the PAYMENT-REQUIRED value, and of every `name: value` line. */
export function measureRawHeaders(rawHeaders: readonly string[]): {
  paymentRequiredBytes: number | null;
  responseHeaderBytes: number;
} {
  let responseHeaderBytes = 0;
  let paymentRequiredBytes: number | null = null;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i] ?? "";
    const value = rawHeaders[i + 1] ?? "";
    responseHeaderBytes += Buffer.byteLength(`${name}: ${value}\r\n`);
    if (name.toLowerCase() !== "payment-required") continue;
    const size = Buffer.byteLength(value);
    paymentRequiredBytes = paymentRequiredBytes == null ? size : Math.max(paymentRequiredBytes, size);
  }
  return { paymentRequiredBytes, responseHeaderBytes };
}

export type ProbeMethod = "GET" | "POST" | "HEAD" | "OPTIONS";

export type ProbeTransport = (input: {
  url: URL;
  ip: string;
  method: ProbeMethod;
  body?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  overflow?: "throw" | "truncate";
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
  /** Byte length of the PAYMENT-REQUIRED value. Null when the header was absent. */
  paymentRequiredBytes: number | null;
  /** Byte length of response header lines. Null when the transport did not measure them. */
  responseHeaderBytes: number | null;
  headersOverflow: boolean;
  /** Access-Control-Allow-Origin from the fetched response. Null when absent. */
  corsAllowOrigin: string | null;
  /** Access-Control-Expose-Headers from the fetched response. Null when absent. */
  corsExposeHeaders: string | null;
};

export async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
}

function headerErrorCode(err: unknown): string {
  if (!err || typeof err !== "object" || !("code" in err)) return "";
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function measuredHop(
  status: number,
  headers: NodeJS.Dict<string | string[] | undefined>,
  rawHeaders: readonly string[],
  body: Buffer,
  truncated?: boolean,
): ProbeHop {
  const measured = measureRawHeaders(rawHeaders);
  return {
    status,
    headers: headerMap(headers),
    body,
    truncated,
    paymentRequiredBytes: measured.paymentRequiredBytes,
    responseHeaderBytes: measured.responseHeaderBytes,
  };
}

function headerMap(headers: NodeJS.Dict<string | string[] | undefined>): { get(name: string): string | null } {
  return {
    get(name: string) {
      const value = headers[name.toLowerCase()];
      if (Array.isArray(value)) {
        const joined = value.map((item) => item.trim()).filter(Boolean).join(", ");
        return joined || null;
      }
      return value ?? null;
    },
  };
}

export function defaultTransport(input: {
  url: URL;
  ip: string;
  method: ProbeMethod;
  body?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  overflow?: "throw" | "truncate";
}): Promise<ProbeHop> {
  const extra = input.headers ?? {};
  const maxBytes = input.maxBytes ?? MAX_BODY_BYTES;
  const overflow = input.overflow ?? "throw";
  const headers: Record<string, string> = {
    accept: extra.accept ?? "application/json",
    host: input.url.host,
    "user-agent": extra["user-agent"] ?? "AgentControl-x402-check/1.0",
  };
  if (input.body) {
    headers["content-type"] = extra["content-type"] ?? "application/json";
    headers["content-length"] = String(Buffer.byteLength(input.body));
  }
  for (const [key, value] of Object.entries(extra)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "content-length" || lower === "accept" || lower === "user-agent") continue;
    if (lower === "content-type" && !input.body) continue;
    headers[lower] = value;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: ProbeHop) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const req = https.request(
      {
        protocol: "https:",
        hostname: input.url.hostname,
        servername: input.url.hostname,
        port: 443,
        path: `${input.url.pathname}${input.url.search}`,
        method: input.method,
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        maxHeaderSize: HEADER_READ_MAX,
        lookup: pinLookup(input.ip) as LookupFunction,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            if (overflow === "truncate") {
              req.destroy();
              finish(measuredHop(res.statusCode ?? 0, res.headers, res.rawHeaders, Buffer.concat(chunks), true));
              return;
            }
            req.destroy(new SsrfError("The reply was too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          finish(measuredHop(res.statusCode ?? 0, res.headers, res.rawHeaders, Buffer.concat(chunks)));
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new SsrfError("The endpoint did not answer in time."));
    });
    req.on("error", (err) => {
      if (headerErrorCode(err) === "HPE_HEADER_OVERFLOW") {
        finish({
          status: 0,
          headers: { get: () => null },
          body: Buffer.alloc(0),
          paymentRequiredBytes: null,
          responseHeaderBytes: HEADER_READ_MAX + 1,
          headersOverflow: true,
        });
        return;
      }
      if (err instanceof SsrfError) fail(err);
      else fail(new SsrfError("The endpoint did not answer."));
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

type HopRequest = {
  method: ProbeMethod;
  body?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  overflow?: "throw" | "truncate";
};

async function oneHop(
  start: URL,
  request: HopRequest,
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
          method: hop === 0 ? request.method : "GET",
          body: hop === 0 ? request.body : undefined,
          headers: request.headers,
          maxBytes: request.maxBytes,
          overflow: request.overflow,
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
  const paymentRequiredBytes =
    result.hop.paymentRequiredBytes !== undefined
      ? result.hop.paymentRequiredBytes
      : headerRaw == null
        ? null
        : Buffer.byteLength(headerRaw);
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
    paymentRequiredBytes,
    responseHeaderBytes: result.hop.responseHeaderBytes ?? null,
    headersOverflow: result.hop.headersOverflow === true,
    corsAllowOrigin: headerText(result.hop.headers.get("access-control-allow-origin")),
    corsExposeHeaders: headerText(result.hop.headers.get("access-control-expose-headers")),
  };
}

function headerText(value: string | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** GET the endpoint the way a buyer would. One POST with an empty JSON body if GET is not 402. */
export async function probeEndpoint(
  rawUrl: string,
  deps: { lookup?: LookupFn; transport?: ProbeTransport } = {},
): Promise<EndpointProbe> {
  const lookup = deps.lookup ?? defaultLookup;
  const transport = deps.transport ?? defaultTransport;
  const start = parsePublicHttpsUrl(rawUrl);
  const getResult = await oneHop(start, { method: "GET" }, lookup, transport);
  if (getResult.hop.status === 402) return finishProbe(getResult, "GET", "payment");
  if (isMcpHop(getResult.finalUrl, getResult.hop)) return finishProbe(getResult, "GET", "mcp");
  const postResult = await oneHop(getResult.finalUrl, { method: "POST", body: "{}" }, lookup, transport);
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
  const result = await oneHop(start, { method, body: method === "POST" ? body : undefined }, lookup, transport);
  return { status: result.hop.status, finalUrl: result.finalUrl.href };
}

export type PublicFetchResult = {
  status: number;
  contentType: string;
  finalUrl: string;
  bodyText: string;
  truncated: boolean;
  headers: { get(name: string): string | null };
};

/** GET, HEAD, or POST a public https URL. Redirects are checked again. Same pin as the x402 probe. */
export async function fetchPublicHttps(
  rawUrl: string,
  opts: {
    method?: ProbeMethod;
    body?: string;
    headers?: Record<string, string>;
    maxBytes?: number;
    lookup?: LookupFn;
    transport?: ProbeTransport;
  } = {},
): Promise<PublicFetchResult> {
  const lookup = opts.lookup ?? defaultLookup;
  const transport = opts.transport ?? defaultTransport;
  const start = parsePublicHttpsUrl(rawUrl);
  const result = await oneHop(
    start,
    {
      method: opts.method ?? "GET",
      body: opts.body,
      headers: opts.headers,
      maxBytes: opts.maxBytes,
      overflow: "truncate",
    },
    lookup,
    transport,
  );
  return {
    status: result.hop.status,
    contentType: result.hop.headers.get("content-type") ?? "",
    finalUrl: result.finalUrl.href,
    bodyText: Buffer.from(result.hop.body).toString("utf8"),
    truncated: result.hop.truncated === true,
    headers: result.hop.headers,
  };
}
