import { findVisibleListingByLink, type ListingQuery } from "../directory/listings.ts";
import { listingPagePath } from "../directory/self-list.ts";
import { X402_CHECK_CAVEAT, X402_CHECK_VALIDATOR_LINE } from "./copy.ts";
import {
  ALREADY_LISTED_LINE,
  listingDraftFromPayment,
  type X402ListingPrefill,
} from "./listing-draft.ts";
import {
  absentCheck,
  checkBazaar,
  checkCorsExpose,
  checkDroppedFields,
  checkExample,
  checkHeadSafe,
  checkHeaderSize,
  checkMerchant,
  checkPresence,
  checkReplyShape,
  checkResourceHttps,
  checkResourceUrl,
  checkSchemaRefs,
  checkSearch,
  checkSnippet,
  checkTargets,
  checkV2Fields,
  checkValidate,
  CORS_EXPOSE_TITLE,
  exampleCallOf,
  exposesPaymentRequired,
  FREE_CHECK_IDS,
  HEAD_SAFE_TITLE,
  resourceUrlOf,
  type CheckAbsence,
  type CheckRow,
  type CorsSeen,
  walletLooksValid,
} from "./checks.ts";
import {
  fetchPublicHttps,
  probeEndpoint,
  probeExchange,
  type EndpointProbe,
  type LookupFn,
  type ProbeMethod,
  type ProbeTransport,
} from "./probe.ts";
import { parsePublicHttpsUrl, SsrfError } from "./ssrf.ts";
import {
  lookupDirectory,
  lookupMerchant,
  lookupRegistry,
  lookupSearch,
  lookupValidate,
  defaultRemoteFetch,
  type RemoteFetch,
} from "./remote.ts";

export type CheckTarget = {
  url: string | null;
  payTo: string | null;
};

export type X402Report = {
  product: "x402_listing_check";
  tier: "free" | "full";
  input: { url?: string; pay_to?: string };
  checks: CheckRow[];
  passed: number;
  failed: number;
  warned: number;
  unchecked: number;
  not_applicable: number;
  caveat: string;
  /** Plain-language score. Omitted the word "failed" when nothing failed. */
  summary: string;
  /** Coinbase's own free validator. We are not the only checker. */
  validator: string;
  fetched: { status: number; final_url: string; content_type: string } | null;
  /**
   * Prefill for the directory when the 402 decoded.
   * Null when the reply was not a decoded 402. Omitted by older callers.
   */
  listing?: X402ListingPrefill | null;
};

export type RunDeps = {
  lookup?: LookupFn;
  transport?: ProbeTransport;
  remote?: RemoteFetch;
  sql?: ListingQuery | null;
  directory?: (host: string, payTos: string[]) => Promise<{ names: string[] } | null>;
  registry?: (host: string) => Promise<{ listed: boolean } | null>;
};

function counts(checks: CheckRow[]) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    failed: checks.filter((check) => check.status === "fail").length,
    warned: checks.filter((check) => check.status === "warn").length,
    unchecked: checks.filter((check) => check.status === "unchecked").length,
    not_applicable: checks.filter((check) => check.status === "na").length,
  };
}

function inputOf(target: CheckTarget): { url?: string; pay_to?: string } {
  return {
    ...(target.url ? { url: target.url } : {}),
    ...(target.payTo ? { pay_to: target.payTo } : {}),
  };
}

function payTosFrom(payment: unknown, pasted: string | null): string[] {
  const found = new Set<string>();
  if (pasted) found.add(pasted);
  if (
    payment &&
    typeof payment === "object" &&
    Array.isArray((payment as { accepts?: unknown }).accepts)
  ) {
    for (const accept of (payment as { accepts: unknown[] }).accepts) {
      if (
        accept &&
        typeof accept === "object" &&
        typeof (accept as { payTo?: unknown }).payTo === "string"
      ) {
        found.add((accept as { payTo: string }).payTo);
      }
    }
  }
  return [...found].slice(0, 3);
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function methodOf(payment: unknown): string {
  const bazaar = (
    payment as { extensions?: { bazaar?: { info?: { input?: { method?: unknown } } } } } | null
  )?.extensions?.bazaar;
  const method = bazaar?.info?.input?.method;
  return typeof method === "string" && method ? method : "GET";
}

async function listingFromDecoded(
  payment: unknown,
  target: CheckTarget,
  probe: EndpointProbe | null,
  deps: RunDeps,
): Promise<X402ListingPrefill | null> {
  if (absenceOf(probe)) return null;
  const draft = listingDraftFromPayment(payment, target.url);
  if (!draft?.body.link || !deps.sql) return draft;
  try {
    const existing = await findVisibleListingByLink(deps.sql, draft.body.link);
    if (!existing) return draft;
    return {
      ...draft,
      existing: {
        id: existing.id,
        name: existing.name,
        href: `https://agent-control.net${listingPagePath(existing.id)}`,
        line: ALREADY_LISTED_LINE,
      },
    };
  } catch (err) {
    console.error("[x402-check] listing lookup failed", err instanceof Error ? err.name : "error");
    return draft;
  }
}

function summaryOf(checks: CheckRow[]): string {
  const failed = checks.filter((check) => check.status === "fail").length;
  const passed = checks.filter((check) => check.status === "pass").length;
  const only = checks.length === 1 ? checks[0] : undefined;
  if (only?.id === "not_402") return only.detail;
  if (failed === 0 && passed === 0) return "Could not check — paste the endpoint URL.";
  const parts = [`${passed} passed`];
  if (failed > 0) parts.push(`${failed} failed`);
  const warned = checks.filter((check) => check.status === "warn").length;
  const unchecked = checks.filter((check) => check.status === "unchecked").length;
  const notApplicable = checks.filter((check) => check.status === "na").length;
  if (warned) parts.push(`${warned} to check`);
  if (unchecked) parts.push(`${unchecked} could not check`);
  if (notApplicable) parts.push(`${notApplicable} not applicable`);
  return `${parts.join(", ")}.`;
}

function absenceOf(probe: EndpointProbe | null): CheckAbsence | null {
  if (!probe) return "wallet";
  if (probe.route === "mcp") return "mcp";
  if (probe.status !== 402) return "not_402";
  if (!probe.payment) return "undecoded";
  return null;
}

/** Origin sent on the unpaid preflight. Not a buyer's payment. */
const BROWSER_ORIGIN = "https://agent-control.net";
const PAYMENT_REQUEST_HEADER = /^(payment-signature|payment-required|x-payment|x-payment-response)$/i;

function unpaidHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (PAYMENT_REQUEST_HEADER.test(key)) continue;
    out[key] = value;
  }
  return out;
}

function corsFromProbe(probe: EndpointProbe): CorsSeen {
  return { allowOrigin: probe.corsAllowOrigin, exposeHeaders: probe.corsExposeHeaders };
}

async function readCors(
  url: string,
  method: ProbeMethod,
  headers: Record<string, string> | undefined,
  body: string | undefined,
  deps: RunDeps,
): Promise<CorsSeen | null> {
  try {
    const result = await fetchPublicHttps(url, {
      method,
      headers: unpaidHeaders(headers),
      body,
      lookup: deps.lookup,
      transport: deps.transport,
    });
    return {
      allowOrigin: result.headers.get("access-control-allow-origin"),
      exposeHeaders: result.headers.get("access-control-expose-headers"),
    };
  } catch {
    return null;
  }
}

/**
 * Read CORS from the 402 we already fetched. When that reply has no CORS headers,
 * one unpaid OPTIONS preflight (and, if that allows an origin, one unpaid repeat
 * of the same method with Origin) so an origin-gated seller can still expose the price.
 */
async function corsRow(probe: EndpointProbe, deps: RunDeps): Promise<CheckRow> {
  const seen: CorsSeen[] = [corsFromProbe(probe)];
  const already = seen[0];
  if (!already || exposesPaymentRequired(already.exposeHeaders) || already.allowOrigin?.trim()) {
    return checkCorsExpose(seen);
  }
  const preflight = await readCors(
    probe.finalUrl,
    "OPTIONS",
    {
      origin: BROWSER_ORIGIN,
      "access-control-request-method": probe.method,
      "access-control-request-headers": "payment-signature",
    },
    undefined,
    deps,
  );
  if (preflight) seen.push(preflight);
  const preflightExposes = preflight ? exposesPaymentRequired(preflight.exposeHeaders) : false;
  const preflightAllows = Boolean(preflight?.allowOrigin?.trim());
  if (!preflightExposes && (preflightAllows || preflight == null)) {
    const replay = await readCors(
      probe.finalUrl,
      probe.method,
      { origin: BROWSER_ORIGIN },
      probe.method === "POST" ? "{}" : undefined,
      deps,
    );
    if (replay) seen.push(replay);
  }
  return checkCorsExpose(seen);
}

/** One unpaid HEAD. No payment header, no signature. Same timeout and SSRF pin as the probe. */
async function headRow(probe: EndpointProbe, deps: RunDeps): Promise<CheckRow> {
  if (probe.method !== "GET") {
    return checkHeadSafe({ status: null, skipped: "post" });
  }
  try {
    const result = await fetchPublicHttps(probe.finalUrl, {
      method: "HEAD",
      lookup: deps.lookup,
      transport: deps.transport,
    });
    return checkHeadSafe({ status: result.status });
  } catch {
    return checkHeadSafe({ status: null });
  }
}

async function exampleRow(
  payment: unknown,
  target: CheckTarget,
  probe: EndpointProbe | null,
  deps: RunDeps,
): Promise<CheckRow> {
  const call = exampleCallOf(payment);
  if (call === "none") return checkExample(null, "none");
  if (call === "mcp") return checkExample(null, "mcp");
  const baseRaw = probe?.finalUrl ?? target.url;
  if (!baseRaw) return checkExample(null, "error");
  const sameGet = call.method === "GET" && !call.search && !call.body && probe?.method !== "POST";
  if (sameGet && probe) return checkExample(probe.status, "pass-or-status");
  try {
    const base = parsePublicHttpsUrl(baseRaw);
    base.hash = "";
    base.search = call.search ? `?${call.search}` : "";
    if (base.href.length > 2000) return checkExample(null, "error");
    const replayed = await probeExchange(base.href, call.method, call.body, {
      lookup: deps.lookup,
      transport: deps.transport,
    });
    return checkExample(replayed.status, "pass-or-status");
  } catch {
    return checkExample(null, "error");
  }
}

function whySnippet(
  payment: unknown,
  requestedUrl: string | null,
  probe: EndpointProbe | null,
): CheckRow {
  const why = absenceOf(probe);
  if (why) return absentCheck("snippet", "Copy-paste snippet", why);
  return checkSnippet(payment, requestedUrl);
}

async function localChecks(
  payment: unknown,
  target: CheckTarget,
  probe: EndpointProbe | null,
  deps: RunDeps,
): Promise<CheckRow[]> {
  const why = absenceOf(probe);
  const reply = checkReplyShape(probe);
  const header =
    probe && probe.status === 402
      ? checkHeaderSize({
          paymentRequiredBytes: probe.paymentRequiredBytes,
          responseHeaderBytes: probe.responseHeaderBytes,
        })
      : absentCheck("header_size", "Price header size", why ?? "wallet");
  if (why || !probe) {
    const reason = why ?? "wallet";
    const targets =
      reason === "wallet"
        ? checkTargets(payment, target.payTo)
        : absentCheck("payment_targets", "Network, asset, and payTo", reason);
    return [
      reply,
      header,
      absentCheck("resource_https", "resource.url https", reason),
      absentCheck("bazaar", "Bazaar extension", reason),
      absentCheck("dropped_fields", "Fields Coinbase may drop", reason),
      absentCheck("example_input", "Example input", reason),
      absentCheck("v2_fields", "x402 version 2 fields", reason),
      absentCheck("resource_url", "Resource URL", reason),
      absentCheck("schema_refs", "Bazaar schema references", reason),
      absentCheck("cors_expose", CORS_EXPOSE_TITLE, reason),
      absentCheck("head_safe", HEAD_SAFE_TITLE, reason),
      targets,
    ];
  }
  const [example, cors, head] = await Promise.all([
    exampleRow(payment, target, probe, deps),
    corsRow(probe, deps),
    headRow(probe, deps),
  ]);
  return [
    reply,
    header,
    checkResourceHttps(payment),
    checkBazaar(payment),
    checkDroppedFields(payment),
    example,
    checkV2Fields(payment),
    checkResourceUrl(payment, target.url),
    checkSchemaRefs(payment),
    cors,
    head,
    checkTargets(payment, target.payTo),
  ];
}

export async function runListingCheck(
  target: CheckTarget,
  tier: "free" | "full",
  deps: RunDeps = {},
): Promise<X402Report> {
  if (!target.url && !target.payTo) {
    throw new SsrfError("Paste an https endpoint or a payTo wallet.");
  }
  if (target.payTo && !walletLooksValid(target.payTo)) {
    throw new SsrfError("That payTo is not a Base address or a Solana address.");
  }

  let probe: EndpointProbe | null = null;
  if (target.url) {
    probe = await probeEndpoint(target.url, { lookup: deps.lookup, transport: deps.transport });
  }
  const payment = probe?.payment ?? null;
  const fetched = probe
    ? { status: probe.status, final_url: probe.finalUrl, content_type: probe.contentType }
    : null;

  if (probe?.headersOverflow) {
    const checks = [
      checkHeaderSize({
        paymentRequiredBytes: probe.paymentRequiredBytes,
        responseHeaderBytes: probe.responseHeaderBytes,
      }),
    ];
    return {
      product: "x402_listing_check",
      tier,
      input: inputOf(target),
      checks,
      ...counts(checks),
      caveat: X402_CHECK_CAVEAT,
      summary: summaryOf(checks),
      validator: X402_CHECK_VALIDATOR_LINE,
      fetched,
      listing: null,
    };
  }

  if (probe && probe.status !== 402) {
    const checks = [checkReplyShape(probe)];
    return {
      product: "x402_listing_check",
      tier,
      input: inputOf(target),
      checks,
      ...counts(checks),
      caveat: X402_CHECK_CAVEAT,
      summary: summaryOf(checks),
      validator: X402_CHECK_VALIDATOR_LINE,
      fetched,
      listing: null,
    };
  }

  const free = await localChecks(payment, target, probe, deps);
  const listing = await listingFromDecoded(payment, target, probe, deps);

  if (tier === "free") {
    const checks = free.filter((check) => (FREE_CHECK_IDS as readonly string[]).includes(check.id));
    return {
      product: "x402_listing_check",
      tier,
      input: inputOf(target),
      checks,
      ...counts(checks),
      caveat: X402_CHECK_CAVEAT,
      summary: summaryOf(checks),
      validator: X402_CHECK_VALIDATOR_LINE,
      fetched,
      listing,
    };
  }

  const remote = deps.remote ?? defaultRemoteFetch;
  const payTos = payTosFrom(payment, target.payTo);
  const advertised = resourceUrlOf(payment) ?? target.url;
  const query = advertised ?? target.payTo ?? "";
  const searchPayTo = payTos[0] ?? null;
  const [merchants, openSearch, curatedSearch, validate, directory, registry] = await Promise.all([
    Promise.all(payTos.map((payTo) => lookupMerchant(payTo, remote))),
    lookupSearch(query, searchPayTo, false, remote),
    lookupSearch(query, searchPayTo, true, remote),
    advertised ? lookupValidate(advertised, methodOf(payment), remote) : Promise.resolve(null),
    deps.directory
      ? deps.directory(hostOf(advertised), payTos)
      : deps.sql
        ? lookupDirectory(deps.sql, hostOf(advertised), payTos)
        : Promise.resolve(null),
    deps.registry ? deps.registry(hostOf(advertised)) : lookupRegistry(hostOf(advertised), remote),
  ]);

  const checks = [
    ...free,
    checkMerchant(payment, merchants.length ? merchants : null, target.payTo),
    checkSearch(payment, [openSearch, curatedSearch]),
    whySnippet(payment, target.url, probe),
    checkPresence({ directory, registry }),
    checkValidate(payment, validate),
  ];

  return {
    product: "x402_listing_check",
    tier,
    input: inputOf(target),
    checks,
    ...counts(checks),
    caveat: X402_CHECK_CAVEAT,
    summary: summaryOf(checks),
    validator: X402_CHECK_VALIDATOR_LINE,
    fetched,
    listing,
  };
}
