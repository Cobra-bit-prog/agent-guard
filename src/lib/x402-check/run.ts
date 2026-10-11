import type { ListingQuery } from "../directory/listings.ts";
import { X402_CHECK_CAVEAT } from "./copy.ts";
import {
  checkBazaar,
  checkMerchant,
  checkPresence,
  checkReplyShape,
  checkResourceUrl,
  checkSearch,
  checkSnippet,
  checkTargets,
  checkV2Fields,
  checkValidate,
  FREE_CHECK_IDS,
  resourceUrlOf,
  type CheckRow,
  walletLooksValid,
} from "./checks.ts";
import { probeEndpoint, type EndpointProbe, type LookupFn, type ProbeTransport } from "./probe.ts";
import { SsrfError } from "./ssrf.ts";
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
  caveat: string;
  fetched: { status: number; final_url: string; content_type: string } | null;
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
  if (payment && typeof payment === "object" && Array.isArray((payment as { accepts?: unknown }).accepts)) {
    for (const accept of (payment as { accepts: unknown[] }).accepts) {
      if (accept && typeof accept === "object" && typeof (accept as { payTo?: unknown }).payTo === "string") {
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
  const bazaar = (payment as { extensions?: { bazaar?: { info?: { input?: { method?: unknown } } } } } | null)
    ?.extensions?.bazaar;
  const method = bazaar?.info?.input?.method;
  return typeof method === "string" && method ? method : "GET";
}

function stripFix(checks: CheckRow[]): CheckRow[] {
  return checks.map((check) => {
    const { fix: _fix, ...rest } = check;
    return rest;
  });
}

function localChecks(payment: unknown, target: CheckTarget, probe: EndpointProbe | null): CheckRow[] {
  return [
    checkV2Fields(payment),
    checkResourceUrl(payment, target.url),
    checkBazaar(payment),
    checkTargets(payment, target.payTo),
    checkReplyShape(probe),
  ];
}

export async function runListingCheck(target: CheckTarget, tier: "free" | "full", deps: RunDeps = {}): Promise<X402Report> {
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
  const free = localChecks(payment, target, probe);

  if (tier === "free") {
    const checks = stripFix(free.filter((check) => (FREE_CHECK_IDS as readonly string[]).includes(check.id)));
    return {
      product: "x402_listing_check",
      tier,
      input: inputOf(target),
      checks,
      ...counts(checks),
      caveat: X402_CHECK_CAVEAT,
      fetched: probe
        ? { status: probe.status, final_url: probe.finalUrl, content_type: probe.contentType }
        : null,
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
    checkSnippet(payment, target.url),
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
    fetched: probe
      ? { status: probe.status, final_url: probe.finalUrl, content_type: probe.contentType }
      : null,
  };
}
