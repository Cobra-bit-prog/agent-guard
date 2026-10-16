import { BASE_USDC, SOLANA_CAIP2 } from "../meter/accepts.ts";
import { USDC_MINT } from "../solana-pay.ts";
import type { EndpointProbe } from "./probe.ts";

export type CheckStatus = "pass" | "fail" | "warn" | "unchecked" | "na";

/** Why a check has no 402 body to read. Never reported as a fail. */
export type CheckAbsence = "wallet" | "mcp" | "not_402" | "undecoded";

/** One piece of a decoded PAYMENT-REQUIRED payload, ranked by UTF-8 JSON size. */
export type HeaderPart = {
  path: string;
  bytes: number;
  /** Fraction of the decoded payload, from 0 to 1. */
  share: number;
};

export type CheckRow = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
  /** Byte length of the PAYMENT-REQUIRED header value. Present on the price-header check. */
  payment_required_bytes?: number | null;
  /** Byte length of the response header lines. Present on the price-header check. */
  response_header_bytes?: number | null;
  /** Three biggest pieces of the decoded price header. Present when that check warns or fails. */
  largest_parts?: HeaderPart[];
  /** Whether the 402 body itself is a payment-requirements object. Present when the price-header check warns or fails. */
  body_has_requirements?: boolean;
};

const V1_ACCEPT_KEYS = ["maxAmountRequired", "outputSchema", "resource", "description", "mimeType"] as const;
const BASE_NETWORKS = new Set(["base", "eip155:8453"]);
const SOLANA_NETWORKS = new Set(["solana", SOLANA_CAIP2]);
const ROUTE_TEMPLATE = /^\/[a-zA-Z0-9_/:.\-~%]+$/;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Bag;
}

function acceptsOf(payment: unknown): Bag[] {
  const root = bag(payment);
  const accepts = root?.accepts;
  if (!Array.isArray(accepts)) return [];
  return accepts.filter((item): item is Bag => Boolean(bag(item)));
}

function resourceOf(payment: unknown): Bag | null {
  return bag(bag(payment)?.resource);
}

export function resourceUrlOf(payment: unknown): string | null {
  const url = resourceOf(payment)?.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function bazaarOf(payment: unknown): Bag | null {
  return bag(bag(bag(payment)?.extensions)?.bazaar);
}

function row(id: string, title: string, status: CheckStatus, detail: string, fix?: string): CheckRow {
  return fix ? { id, title, status, detail, fix } : { id, title, status, detail };
}

export const COULD_NOT_CHECK_URL = "Could not check — paste the endpoint URL.";
export const NOT_402_DETAIL = "Not an HTTP 402 endpoint — could not check. Paste the URL that returns HTTP 402.";

export function absentCheck(id: string, title: string, why: CheckAbsence): CheckRow {
  if (why === "undecoded") {
    return row(id, title, "unchecked", "Could not check. The 402 did not include a payment object.");
  }
  if (why === "wallet") {
    return row(id, title, "unchecked", COULD_NOT_CHECK_URL);
  }
  if (why === "mcp" || why === "not_402") {
    return row(id, title, "unchecked", NOT_402_DETAIL);
  }
  return row(id, title, "unchecked", COULD_NOT_CHECK_URL);
}

export function checkV2Fields(payment: unknown): CheckRow {
  const title = "x402 version 2 fields";
  const root = bag(payment);
  if (!root) return row("v2_fields", title, "fail", "The 402 did not include a payment object.");
  const problems: string[] = [];
  if (root.x402Version !== 2) {
    problems.push(
      root.x402Version === 1
        ? "x402Version is 1. Version 2 is the one Bazaar catalogs."
        : "x402Version must be 2.",
    );
  }
  if (!resourceOf(payment)) problems.push("resource must be an object with a url. A string on the accept is the old shape.");
  const accepts = root.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) problems.push("accepts must list at least one way to pay.");
  const stray = new Set<string>();
  for (const accept of acceptsOf(payment)) {
    for (const key of V1_ACCEPT_KEYS) {
      if (key in accept) stray.add(key);
    }
    for (const key of ["scheme", "network", "amount", "asset", "payTo", "maxTimeoutSeconds"] as const) {
      if (accept[key] == null || accept[key] === "") problems.push(`An accept is missing ${key}.`);
    }
    if (typeof accept.amount === "string" && !/^\d+$/.test(accept.amount)) {
      problems.push("amount must be a whole number of token units.");
    }
  }
  if (stray.size) {
    problems.push(`Old v1 fields are still on an accept: ${[...stray].join(", ")}. v2 uses amount, resource.url, and extensions.bazaar.`);
  }
  if (problems.length) return row("v2_fields", title, "fail", problems.slice(0, 4).join(" "));
  return row("v2_fields", title, "pass", "Version is 2, resource is an object, and accepts use amount rather than the old v1 names.");
}

function pathnameOf(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

function slashMismatch(left: string, right: string): boolean {
  if (left === right) return false;
  const trim = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);
  return trim(left) === trim(right);
}

export function checkResourceUrl(payment: unknown, requestedUrl: string | null): CheckRow {
  const title = "Resource URL";
  if (!requestedUrl) {
    return row(
      "resource_url",
      title,
      "na",
      "Not applicable. A wallet alone has no resource.url to compare. Paste the https endpoint.",
    );
  }
  const url = resourceUrlOf(payment);
  if (!url) return row("resource_url", title, "fail", "resource.url is missing. Bazaar has nothing to attach a payment to.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return row("resource_url", title, "fail", "resource.url is not an absolute URL.");
  }
  const problems: string[] = [];
  if (parsed.search) problems.push("resource.url has a query string. Leave the query off.");
  if (parsed.hash) problems.push("resource.url has a fragment. Leave it off.");
  let requested: URL | null = null;
  try {
    requested = new URL(requestedUrl);
  } catch {
    requested = null;
  }
  if (requested?.search) problems.push("The URL you pasted has a query string. The catalog key should be the path without it.");
  if (requested && slashMismatch(parsed.pathname, requested.pathname)) {
    problems.push("The trailing slash on resource.url does not match the URL you asked us to read.");
  }
  if (requested && parsed.host.toLowerCase() !== requested.host.toLowerCase()) {
    problems.push("resource.url points at a different host than the URL you pasted.");
  }
  if (problems.length) return row("resource_url", title, "fail", problems.join(" "));
  return row("resource_url", title, "pass", "resource.url has no query string, and the slash matches the URL you pasted.");
}

export function checkResourceHttps(payment: unknown): CheckRow {
  const title = "resource.url https";
  const url = resourceUrlOf(payment);
  if (!url) {
    return row("resource_https", title, "fail", "resource.url is missing. Bazaar needs an absolute https URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return row("resource_https", title, "fail", "resource.url is not an absolute URL, so it is not https.");
  }
  if (parsed.protocol === "https:") {
    return row("resource_https", title, "pass", "resource.url uses https://.");
  }
  if (parsed.protocol === "http:") {
    return row(
      "resource_https",
      title,
      "fail",
      "resource.url uses http:// instead of https://. Bazaar catalogs https URLs. Change it to https://.",
    );
  }
  return row("resource_https", title, "fail", `resource.url uses ${parsed.protocol} Paste an https:// URL.`);
}

function routeTemplateOf(bazaar: Bag): string | null {
  const value = bazaar.routeTemplate;
  return typeof value === "string" ? value : null;
}

function templateValid(template: string): boolean {
  if (!template.startsWith("/")) return false;
  if (template.includes("..") || template.includes("://")) return false;
  try {
    if (decodeURIComponent(template).includes("..")) return false;
  } catch {
    return false;
  }
  return ROUTE_TEMPLATE.test(template);
}

function parameterized(value: string): boolean {
  return value.includes(":") || value.includes("*") || value.includes("{");
}

export function checkBazaar(payment: unknown): CheckRow {
  const title = "Bazaar extension";
  const bazaar = bazaarOf(payment);
  if (!bazaar) {
    return row(
      "bazaar",
      title,
      "fail",
      "extensions.bazaar is missing. A settled payment does not get cataloged when the buyer has nothing to echo.",
    );
  }
  if (!bag(bazaar.info) || !bag(bazaar.schema)) {
    return row("bazaar", title, "fail", "extensions.bazaar needs both info and schema.");
  }
  const template = routeTemplateOf(bazaar);
  const path = pathnameOf(resourceUrlOf(payment) ?? "") ?? "";
  if (!template) {
    if (parameterized(path)) {
      return row(
        "bazaar",
        title,
        "warn",
        "The path looks parameterized and there is no routeTemplate. Facilitators use a concrete path when the template is missing, and a :param path often never becomes its own row.",
      );
    }
    return row(
      "bazaar",
      title,
      "pass",
      "extensions.bazaar is present. There is no routeTemplate. For this fixed path, facilitators can use the concrete URL.",
    );
  }
  if (!templateValid(template)) {
    return row("bazaar", title, "fail", "routeTemplate is not a plain path. It should start with / and stay inside that path.");
  }
  if (parameterized(template)) {
    return row(
      "bazaar",
      title,
      "warn",
      `routeTemplate is ${template}. A :param route often does not show up as its own Bazaar row. A fixed path is easier to find.`,
    );
  }
  const wanted = path.length > 1 ? path.replace(/\/+$/, "") : path || "/";
  const got = template.length > 1 ? template.replace(/\/+$/, "") : template;
  if (wanted && got !== wanted) {
    return row("bazaar", title, "fail", `routeTemplate is ${template}, which does not match resource.url.`);
  }
  return row("bazaar", title, "pass", `extensions.bazaar is present and routeTemplate is ${template}.`);
}

function knownMainnet(accept: Bag): "base" | "solana" | null {
  const network = typeof accept.network === "string" ? accept.network : "";
  const asset = typeof accept.asset === "string" ? accept.asset : "";
  if (BASE_NETWORKS.has(network) && asset.toLowerCase() === BASE_USDC.toLowerCase()) return "base";
  if (SOLANA_NETWORKS.has(network) && asset === USDC_MINT) return "solana";
  return null;
}

export function payToLooksValid(network: string, payTo: string): boolean {
  if (BASE_NETWORKS.has(network) || network.startsWith("eip155:")) return EVM_ADDRESS.test(payTo);
  if (SOLANA_NETWORKS.has(network) || network.startsWith("solana")) return SOL_ADDRESS.test(payTo);
  return EVM_ADDRESS.test(payTo) || SOL_ADDRESS.test(payTo);
}

export function walletLooksValid(value: string): boolean {
  return EVM_ADDRESS.test(value) || SOL_ADDRESS.test(value);
}

export function checkTargets(payment: unknown, pastedPayTo: string | null): CheckRow {
  const title = "Network, asset, and payTo";
  const accepts = acceptsOf(payment);
  if (accepts.length === 0) {
    if (pastedPayTo && walletLooksValid(pastedPayTo)) {
      return row(
        "payment_targets",
        title,
        "warn",
        "That wallet looks like a Base or Solana address. Paste the endpoint to check the network and the USDC contract.",
      );
    }
    if (pastedPayTo) return row("payment_targets", title, "fail", "That payTo is not a Base address or a Solana address.");
    return row("payment_targets", title, "fail", "There is no accept to check.");
  }
  const problems: string[] = [];
  let base = false;
  let solana = false;
  const extras = new Set<string>();
  for (const accept of accepts) {
    const network = typeof accept.network === "string" ? accept.network : "";
    const payTo = typeof accept.payTo === "string" ? accept.payTo : "";
    const kind = knownMainnet(accept);
    if (!payTo || !payToLooksValid(network, payTo)) {
      problems.push(`payTo on ${network || "an accept"} is not a valid address.`);
      continue;
    }
    if (kind === "base") base = true;
    else if (kind === "solana") solana = true;
    else extras.add(network || "other");
  }
  if (!base && !solana) {
    problems.push("No accept is Base USDC or Solana USDC. Those are the two this check knows.");
  }
  if (pastedPayTo) {
    const listed = accepts.some((accept) => String(accept.payTo).toLowerCase() === pastedPayTo.toLowerCase());
    if (!walletLooksValid(pastedPayTo)) problems.push("The wallet you pasted is not a Base or Solana address.");
    else if (!listed) problems.push("The wallet you pasted is not a payTo on this 402.");
  }
  if (problems.length) return row("payment_targets", title, "fail", problems.slice(0, 4).join(" "));
  const which = [base ? "Base USDC" : "", solana ? "Solana USDC" : ""].filter(Boolean).join(" and ");
  const extraNote = extras.size ? ` Other networks are listed too (${[...extras].slice(0, 4).join(", ")}). This check confirms Base and Solana USDC.` : "";
  return row("payment_targets", title, "pass", `${which} payTo addresses look valid.${extraNote}`);
}

export function checkReplyShape(probe: EndpointProbe | null): CheckRow {
  const title = "402 reply";
  if (!probe) {
    return row("reply_shape", title, "unchecked", COULD_NOT_CHECK_URL);
  }
  if (probe.route === "mcp" || probe.status !== 402) {
    return row("not_402", "HTTP 402 endpoint", "unchecked", NOT_402_DETAIL);
  }
  const json = probe.contentType.toLowerCase().includes("application/json");
  const decoded = probe.payment != null;
  if (probe.status !== 402) {
    return row("reply_shape", title, "fail", `The endpoint returned HTTP ${probe.status}. A buyer needs HTTP 402.`);
  }
  if (!decoded) return row("reply_shape", title, "fail", probe.decodeError ?? "HTTP 402, but the payment requirement did not decode.");
  if (!json) {
    return row(
      "reply_shape",
      title,
      "warn",
      "HTTP 402 and the payment header decoded. Content-Type is not application/json.",
    );
  }
  const where = probe.paymentSource === "header" ? "PAYMENT-REQUIRED header" : "JSON body";
  return row("reply_shape", title, "pass", `HTTP 402, application/json, and the ${where} decoded.`);
}

/** aiohttp rejects a header line over this. Node fetch rejects a header block over the fail limit. */
export const HEADER_SIZE_WARN_BYTES = 8_190;
export const HEADER_SIZE_FAIL_BYTES = 16_384;
export const HEADER_SIZE_ISSUE = "https://github.com/x402-foundation/x402/issues/3803";
export const HEADER_SIZE_TITLE = "Price header size";

export type HeaderSizeInput = {
  paymentRequiredBytes: number | null;
  responseHeaderBytes: number | null;
  /** Decoded PAYMENT-REQUIRED header. Omit when that header did not decode. */
  payment?: unknown;
  /** True when the 402 response body itself is a payment-requirements object. */
  bodyHasRequirements?: boolean;
};

/** True when a 402 body is payment requirements, not an empty or unrelated payload. */
export function bodyHasPaymentRequirements(bodyText: string): boolean {
  const trimmed = bodyText.trim();
  if (!trimmed) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const root = bag(parsed);
    if (!root) return false;
    return "x402Version" in root || "accepts" in root || "resource" in root;
  } catch {
    return false;
  }
}

const HEADER_SPLIT_PATHS = new Set([
  "",
  "resource",
  "extensions",
  "extensions.bazaar",
  "extensions.bazaar.info",
  "extensions.bazaar.info.input",
  "extensions.bazaar.info.output",
]);

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "null", "utf8");
  } catch {
    return 0;
  }
}

function objectEntries(value: object): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  return Object.entries(value);
}

function keepWhole(path: string): boolean {
  return path.endsWith(".schema") || path.endsWith(".example") || path.endsWith(".description") || path.endsWith("outputSchema");
}

function shouldSplit(path: string, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (keepWhole(path)) return false;
  const entries = objectEntries(value);
  if (entries.length === 0) return false;
  if (HEADER_SPLIT_PATHS.has(path)) return true;
  const total = jsonBytes(value);
  if (total <= 0) return false;
  let largest = 0;
  for (const [, child] of entries) largest = Math.max(largest, jsonBytes(child));
  return largest / total >= 0.55;
}

function collectParts(value: unknown, path: string, out: Array<{ path: string; bytes: number }>): void {
  if (value && typeof value === "object" && shouldSplit(path, value)) {
    for (const [key, child] of objectEntries(value)) {
      collectParts(child, path ? `${path}.${key}` : key, out);
    }
    return;
  }
  if (!path) return;
  out.push({ path, bytes: jsonBytes(value) });
}

/** The biggest disjoint pieces of a decoded PAYMENT-REQUIRED object. */
export function largestPaymentParts(payment: unknown, limit = 3): HeaderPart[] {
  if (!payment || typeof payment !== "object") return [];
  const total = jsonBytes(payment);
  if (total <= 0) return [];
  const found: Array<{ path: string; bytes: number }> = [];
  collectParts(payment, "", found);
  found.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));
  return found.slice(0, limit).map((part) => ({
    path: part.path,
    bytes: part.bytes,
    share: Math.round((part.bytes / total) * 10_000) / 10_000,
  }));
}

function partLabel(path: string): string {
  if (path === "extensions.bazaar.schema" || path.endsWith(".input.schema")) return "input schema";
  if (path.endsWith(".output.schema") || path.endsWith("outputSchema")) return "output schema";
  if (path.endsWith(".schema")) return "schema";
  if (path.includes(".output.") && path.endsWith(".example")) return "output example";
  if (path.endsWith(".input.body") || path === "extensions.bazaar.info.input") return "input example";
  if (path.endsWith(".example")) return "example";
  if (path.endsWith(".description")) return "description";
  if (path === "accepts") return "accepts list";
  const tail = path.split(".").slice(-2).join(" ");
  return tail || path;
}

function formatCount(bytes: number): string {
  return bytes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function partsSentence(parts: HeaderPart[], hadPayment: boolean): string {
  if (parts.length === 0) {
    return hadPayment
      ? "The decoded price header has no separate pieces to name."
      : "The price header did not decode, so its largest pieces could not be named.";
  }
  const [first, ...rest] = parts;
  const firstBit = `the ${partLabel(first.path)} (${Math.round(first.share * 100)}%, ${formatCount(first.bytes)} bytes)`;
  const lead = first.share >= 0.5 ? `Most of your price header is ${firstBit}.` : `The largest piece of your price header is ${firstBit}.`;
  const next =
    rest.length === 0
      ? ""
      : ` The next largest ${rest.length === 1 ? "is" : "are"} ${rest
          .map((part) => `the ${partLabel(part.path)} (${Math.round(part.share * 100)}%, ${formatCount(part.bytes)} bytes)`)
          .join(" and ")}.`;
  return `${lead}${next} Trimming it gets you under the limit.`;
}

function bodySentence(has: boolean): string {
  if (has) {
    return "The 402 body also carries the payment requirements, so a buyer who cannot read this header can still read the price from the body.";
  }
  return "The 402 body does not carry the payment requirements. A buyer who cannot read this header cannot see the price.";
}

function headerSizeDetail(size: HeaderSizeInput, sentence: string): string {
  const parts: string[] = [];
  if (size.paymentRequiredBytes != null) parts.push(`PAYMENT-REQUIRED is ${size.paymentRequiredBytes} bytes.`);
  if (size.responseHeaderBytes != null) parts.push(`Response headers are ${size.responseHeaderBytes} bytes.`);
  const measured = parts.join(" ");
  return measured ? `${measured} ${sentence}` : sentence;
}

function withHeaderBreakdown(size: HeaderSizeInput, base: CheckRow, counts: Pick<CheckRow, "payment_required_bytes" | "response_header_bytes">): CheckRow {
  const largest_parts = largestPaymentParts(size.payment);
  const body_has_requirements = size.bodyHasRequirements === true;
  const hadPayment = size.payment != null && typeof size.payment === "object";
  return {
    ...base,
    detail: `${base.detail} ${partsSentence(largest_parts, hadPayment)} ${bodySentence(body_has_requirements)}`,
    ...counts,
    largest_parts,
    body_has_requirements,
  };
}

/** Warn above 8,190 bytes. Fail above 16,384. Counts are the measured bytes. */
export function checkHeaderSize(size: HeaderSizeInput): CheckRow {
  const payment = size.paymentRequiredBytes;
  const total = size.responseHeaderBytes;
  const headerFails = payment != null && payment > HEADER_SIZE_FAIL_BYTES;
  const totalFails = total != null && total > HEADER_SIZE_FAIL_BYTES;
  const counts = { payment_required_bytes: payment, response_header_bytes: total };
  if (headerFails || totalFails) {
    return withHeaderBreakdown(
      size,
      row("header_size", HEADER_SIZE_TITLE, "fail", headerSizeDetail(size, `Node fetch buyers can't read it either. ${HEADER_SIZE_ISSUE}`)),
      counts,
    );
  }
  if (payment != null && payment > HEADER_SIZE_WARN_BYTES) {
    return withHeaderBreakdown(
      size,
      row("header_size", HEADER_SIZE_TITLE, "warn", headerSizeDetail(size, `Some Python buyers can't read it. ${HEADER_SIZE_ISSUE}`)),
      counts,
    );
  }
  if (payment == null) {
    const totalNote = total == null ? "" : ` Response headers are ${total} bytes.`;
    return {
      ...row("header_size", HEADER_SIZE_TITLE, "pass", `No PAYMENT-REQUIRED header. The price was in the body.${totalNote}`),
      ...counts,
    };
  }
  const totalNote = total == null ? "" : ` Response headers are ${total} bytes.`;
  return {
    ...row("header_size", HEADER_SIZE_TITLE, "pass", `PAYMENT-REQUIRED is ${payment} bytes.${totalNote}`),
    ...counts,
  };
}

export type MerchantLook = {
  payTo: string;
  state: "ok" | "error";
  resources: string[];
};

function normUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return value.trim();
  }
}

export function checkMerchant(payment: unknown, looks: MerchantLook[] | null, pastedPayTo: string | null): CheckRow {
  const title = "Coinbase merchant list";
  if (!looks || looks.length === 0) {
    return row("merchant", title, "unchecked", "Could not check Coinbase's merchant list.");
  }
  if (looks.every((look) => look.state === "error")) {
    return row("merchant", title, "unchecked", "Could not check Coinbase's merchant list.");
  }
  const wanted = resourceUrlOf(payment);
  const found = new Set<string>();
  let anyResources = false;
  for (const look of looks) {
    if (look.state !== "ok") continue;
    if (look.resources.length) anyResources = true;
    for (const resource of look.resources) found.add(normUrl(resource));
  }
  if (wanted) {
    if (found.has(normUrl(wanted))) {
      return row(
        "merchant",
        title,
        "pass",
        "This resource URL is on Coinbase's public merchant list for a payTo on the 402. That list can still lag.",
      );
    }
    if (anyResources) {
      return row(
        "merchant",
        title,
        "fail",
        "This payTo has other resources on Coinbase's merchant list, and this URL is not one of them.",
      );
    }
    return row("merchant", title, "fail", "Coinbase's merchant list has no resources for this payTo.");
  }
  if (pastedPayTo && anyResources) {
    return row("merchant", title, "pass", "This payTo has resources on Coinbase's merchant list. Paste the endpoint to see if your URL is one of them.");
  }
  return row("merchant", title, "fail", "Coinbase's merchant list has no resources for this payTo.");
}

export type SearchLook = {
  curatedOnly: boolean;
  state: "ok" | "error";
  partial: boolean;
  resources: string[];
};

export function checkSearch(payment: unknown, looks: SearchLook[] | null): CheckRow {
  const title = "Bazaar search";
  if (!looks) return row("search", title, "unchecked", "Could not check Bazaar search.");
  const open = looks.find((look) => !look.curatedOnly);
  const curated = looks.find((look) => look.curatedOnly);
  if (!open || open.state === "error") {
    return row("search", title, "unchecked", "Could not check Bazaar search.");
  }
  const wanted = resourceUrlOf(payment);
  const has = (look: SearchLook | undefined) => {
    if (!look || look.state !== "ok") return false;
    if (!wanted) return look.resources.length > 0;
    return look.resources.some((item) => normUrl(item) === normUrl(wanted));
  };
  const inOpen = has(open);
  const curatedFailed = !curated || curated.state === "error";
  const inCurated = has(curated);
  const label = wanted ? "This URL" : "This payTo";
  if (curatedFailed) {
    return row(
      "search",
      title,
      "unchecked",
      inOpen
        ? `The open search found a hit for ${label.toLowerCase()}. Could not check the curatedOnly search.`
        : "Could not check the curatedOnly search, so this cannot tell indexed-but-hidden from missing.",
    );
  }
  if (inOpen && inCurated) {
    return row(
      "search",
      title,
      "pass",
      wanted
        ? "This URL shows up in search with curatedOnly off and with curatedOnly on."
        : "This payTo has resources in both searches. Paste the endpoint to see if your URL is one of them.",
    );
  }
  if (inOpen && !inCurated) {
    return row(
      "search",
      title,
      "warn",
      "Indexed, and missing from the curated search. Curated is Coinbase's choice. You can be indexed and still left out of that view.",
    );
  }
  if (open.partial || curated?.partial) {
    return row(
      "search",
      title,
      "unchecked",
      "This was not in the page of results, and the search said there were more. That is not proof it is missing.",
    );
  }
  return row(
    "search",
    title,
    "fail",
    "Not in the open search or the curatedOnly search. That can mean not indexed. Coinbase's index can also lag after a payment that already settled.",
  );
}

export function bazaarSnippet(payment: unknown, requestedUrl: string | null): string {
  const existingUrl = resourceUrlOf(payment);
  const source = existingUrl || requestedUrl || "https://example.com/your-path";
  let href = source;
  let path = "/your-path";
  try {
    const url = new URL(source);
    url.search = "";
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    href = url.href;
    path = url.pathname || "/";
  } catch {
    href = source.split("?")[0] ?? source;
  }
  const resource = resourceOf(payment);
  const bazaar = bazaarOf(payment);
  const input = bag(bag(bazaar?.info)?.input);
  const method = typeof input?.method === "string" ? input.method : "GET";
  const description =
    typeof resource?.description === "string" && resource.description.trim()
      ? resource.description.trim()
      : "What this endpoint returns";
  return JSON.stringify(
    {
      x402Version: 2,
      resource: {
        url: href,
        description,
        mimeType: "application/json",
      },
      extensions: {
        bazaar: {
          info: {
            input: { type: "http", method },
            output: { type: "json" },
          },
          schema: {
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "object",
            properties: {
              input: { type: "object" },
              output: { type: "object" },
            },
            required: ["input"],
          },
          routeTemplate: path,
        },
      },
    },
    null,
    2,
  );
}

export function checkSnippet(payment: unknown, requestedUrl: string | null): CheckRow {
  const title = "Copy-paste snippet";
  const snippet = bazaarSnippet(payment, requestedUrl);
  if (!requestedUrl && !resourceUrlOf(payment)) {
    return row(
      "snippet",
      title,
      "na",
      "Not applicable. Paste the https endpoint to get a snippet.",
      snippet,
    );
  }
  const missing: string[] = [];
  if (!resourceUrlOf(payment)) missing.push("resource.url");
  if (!bazaarOf(payment)) missing.push("extensions.bazaar");
  if (missing.length) {
    return row("snippet", title, "fail", `Add ${missing.join(" and ")}. Put this on the 402.`, snippet);
  }
  return row(
    "snippet",
    title,
    "pass",
    "resource and extensions.bazaar are already on the 402. This snippet is the same shape, with a concrete routeTemplate.",
    snippet,
  );
}

export function checkPresence(input: {
  directory: { names: string[] } | null;
  registry: { listed: boolean } | null;
}): CheckRow {
  const title = "Our directory and the MCP Registry";
  const parts: string[] = [];
  let directoryStatus: CheckStatus = "unchecked";
  let registryStatus: CheckStatus = "unchecked";
  if (!input.directory) parts.push("Could not check our directory.");
  else if (input.directory.names.length) {
    directoryStatus = "pass";
    parts.push(`Listed in our directory: ${input.directory.names.slice(0, 3).join(", ")}.`);
  } else {
    directoryStatus = "fail";
    parts.push("Not listed in our directory. Listing there is free.");
  }
  if (!input.registry) parts.push("Could not check the MCP Registry.");
  else if (input.registry.listed) {
    registryStatus = "pass";
    parts.push("A matching server showed up in the public MCP Registry.");
  } else {
    registryStatus = "fail";
    parts.push("Not listed in the public MCP Registry.");
  }
  const statuses = [directoryStatus, registryStatus];
  const status: CheckStatus = statuses.every((item) => item === "pass")
    ? "pass"
    : statuses.every((item) => item === "unchecked")
      ? "unchecked"
      : statuses.includes("fail")
        ? "fail"
        : "warn";
  return row("directory_registry", title, status, parts.join(" "));
}

export type ValidateLook =
  | { state: "ok"; valid: boolean; outcome: string | null; failed: string[] }
  | { state: "error" };

export function checkValidate(payment: unknown, look: ValidateLook | null): CheckRow {
  const title = "Coinbase validate";
  const resource = resourceOf(payment);
  const tags = Array.isArray(resource?.tags) ? resource.tags.length : 0;
  const notes: string[] = [];
  if (tags > 5) notes.push(`There are ${tags} tags. Facilitators keep about 5.`);
  const serviceName = typeof resource?.serviceName === "string" ? resource.serviceName : "";
  if (serviceName.length > 32) notes.push("serviceName is longer than 32 characters.");
  if (!look || look.state === "error") {
    return row(
      "coinbase_validate",
      title,
      "unchecked",
      ["Could not check Coinbase's public validate endpoint.", ...notes].join(" "),
    );
  }
  const local = notes.length ? ` ${notes.join(" ")}` : "";
  if (!look.valid) {
    const why = look.failed.length ? ` ${look.failed.slice(0, 3).join(" ")}` : "";
    return row("coinbase_validate", title, "fail", `Coinbase validate did not accept this endpoint.${why}${local}`);
  }
  const outcome = look.outcome ? ` Simulation outcome: ${look.outcome}.` : "";
  if (notes.length) {
    return row(
      "coinbase_validate",
      title,
      "warn",
      `Coinbase validate accepted the probe.${outcome} A pass does not mean Coinbase will list you.${local}`,
    );
  }
  return row(
    "coinbase_validate",
    title,
    "pass",
    `Coinbase validate accepted the probe.${outcome} A pass does not mean Coinbase will list you.`,
  );
}

const DESCRIPTION_LIMIT = 500;
const NAME_LIMIT = 32;
const TAG_LIMIT = 32;
const TAG_COUNT = 5;
const ICON_LIMIT = 2048;
const PRINTABLE_ASCII = /^[ -~]+$/;
const LOOPBACK_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "bmp"]);

type FieldIssue = { level: "fail" | "warn"; detail: string; fix: string };

function printableAscii(value: string): boolean {
  return PRINTABLE_ASCII.test(value);
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function looksLikeIp(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  return bare.includes(":");
}

function iconIssues(raw: string): FieldIssue[] {
  if (raw.length > ICON_LIMIT) {
    return [
      {
        level: "fail",
        detail: `The icon URL is ${raw.length} characters. The x402 spec drops an icon URL longer than ${ICON_LIMIT} characters.`,
        fix: `Shorten iconUrl to ${ICON_LIMIT} characters or fewer.`,
      },
    ];
  }
  if (hasControlChar(raw)) {
    return [
      {
        level: "fail",
        detail: "The icon URL contains a control character. The x402 spec drops it.",
        fix: "Use a public https icon URL with no control characters.",
      },
    ];
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return [
      {
        level: "fail",
        detail: "The icon URL is not an absolute http or https URL. The x402 spec drops it.",
        fix: "Set iconUrl to a public https address.",
      },
    ];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return [
      {
        level: "fail",
        detail: `The icon URL uses ${parsed.protocol} The x402 spec drops anything that is not http or https.`,
        fix: "Set iconUrl to a public https address.",
      },
    ];
  }
  if (parsed.username || parsed.password) {
    return [
      {
        level: "fail",
        detail: "The icon URL includes a username. The x402 spec drops it.",
        fix: "Remove the username and set iconUrl to a public https address.",
      },
    ];
  }
  let host = parsed.hostname.toLowerCase();
  try {
    host = decodeURIComponent(host);
  } catch {
    host = parsed.hostname.toLowerCase();
  }
  if (looksLikeIp(host) || LOOPBACK_HOSTS.has(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return [
      {
        level: "fail",
        detail: "The icon URL points at a local or numeric host. The x402 spec drops it, so the icon will not load.",
        fix: "Point iconUrl at a public https host.",
      },
    ];
  }
  const issues: FieldIssue[] = [];
  if (parsed.protocol === "http:") {
    issues.push({
      level: "warn",
      detail:
        "The icon uses http. Sellers report Coinbase keeps an icon only when it is a public https URL. The spec still allows http, so this is not a hard miss.",
      fix: "Change iconUrl to https.",
    });
  }
  const ext = parsed.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (ext && !IMAGE_EXT.has(ext)) {
    issues.push({
      level: "warn",
      detail: `The icon address ends in .${ext}. Sellers report an icon that is not a normal image may not show. The spec does not require a file type, so this is not a hard miss.`,
      fix: "Use a png, jpg, webp, gif, or svg at a public https address.",
    });
  }
  return issues;
}

/**
 * Fields the catalog can drop or reject.
 * Documented: description over 500 (CDP rejects verify/settle), serviceName and tags
 * (x402 spec soft-drops), iconUrl shape (x402 spec soft-drops).
 * http-only icons and odd file types are seller reports, so they warn.
 */
export function checkDroppedFields(payment: unknown): CheckRow {
  const title = "Fields Coinbase may drop";
  const resource = resourceOf(payment);
  const issues: FieldIssue[] = [];

  const description = resource?.description;
  if (typeof description === "string" && description.length > DESCRIPTION_LIMIT) {
    issues.push({
      level: "fail",
      detail: `The description is ${description.length} characters. Coinbase's facilitator rejects a description over ${DESCRIPTION_LIMIT} characters, so the payment can be turned away before it is listed.`,
      fix: `Shorten the description to ${DESCRIPTION_LIMIT} characters or fewer.`,
    });
  }

  if (typeof resource?.serviceName === "string") {
    const name = resource.serviceName;
    if (!name || name.length > NAME_LIMIT || !printableAscii(name)) {
      const detail =
        name.length > NAME_LIMIT
          ? `The name is ${name.length} characters. The x402 spec drops a serviceName longer than ${NAME_LIMIT} characters.`
          : "The name is empty or not plain ASCII. The x402 spec drops a serviceName that is not 1 to 32 printable ASCII characters.";
      issues.push({
        level: "fail",
        detail,
        fix: `Use a serviceName of ${NAME_LIMIT} plain ASCII characters or fewer.`,
      });
    }
  }

  if (resource && "tags" in resource && resource.tags !== undefined) {
    const tags = resource.tags;
    if (!Array.isArray(tags)) {
      issues.push({
        level: "fail",
        detail: "tags is not a list. The x402 spec keeps at most 5 short ASCII tags and drops anything else.",
        fix: "Send tags as a list of up to 5 short ASCII words.",
      });
    } else {
      const problems: string[] = [];
      if (tags.length > TAG_COUNT) problems.push(`there are ${tags.length} tags and the spec keeps ${TAG_COUNT}`);
      const seen = new Set<string>();
      for (const tag of tags.slice(0, TAG_COUNT)) {
        if (typeof tag !== "string" || !tag || tag.length > TAG_LIMIT || !printableAscii(tag)) {
          problems.push("a tag is missing, too long, or not plain ASCII");
          break;
        }
        const key = tag.toLowerCase();
        if (seen.has(key)) problems.push("a repeated tag is dropped");
        seen.add(key);
      }
      if (problems.length) {
        issues.push({
          level: "fail",
          detail: `Tags will be cut down. ${problems[0]}. Each tag must be ${TAG_LIMIT} plain ASCII characters or fewer, and only the first ${TAG_COUNT} count.`,
          fix: `Keep ${TAG_COUNT} tags or fewer, each ${TAG_LIMIT} plain ASCII characters or fewer.`,
        });
      }
    }
  }

  if (typeof resource?.iconUrl === "string") {
    issues.push(...iconIssues(resource.iconUrl));
  } else if (resource && "iconUrl" in resource && resource.iconUrl != null && resource.iconUrl !== "") {
    issues.push({
      level: "fail",
      detail: "iconUrl is not text. The x402 spec drops an icon that is not an http or https URL.",
      fix: "Set iconUrl to a public https address.",
    });
  }

  if (issues.length === 0) {
    return row(
      "dropped_fields",
      title,
      "pass",
      "Description, name, tags, and icon are within the limits Coinbase and the x402 spec publish. A missing field is fine.",
    );
  }
  const status: CheckStatus = issues.some((item) => item.level === "fail") ? "fail" : "warn";
  return row("dropped_fields", title, status, issues.map((item) => item.detail).join(" "), issues.map((item) => item.fix).join("\n"));
}

function externalSchemaRef(value: string): boolean {
  return !value.startsWith("#");
}

function walkExternalSchema(value: unknown, hits: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkExternalSchema(item, hits);
    return;
  }
  const record = value as Bag;
  if (typeof record.$ref === "string" && externalSchemaRef(record.$ref)) hits.push(`$ref ${record.$ref}`);
  if (typeof record.$id === "string" && externalSchemaRef(record.$id)) hits.push(`$id ${record.$id}`);
  for (const [key, child] of Object.entries(record)) {
    if (key === "$ref" || key === "$id") continue;
    walkExternalSchema(child, hits);
  }
}

export function checkSchemaRefs(payment: unknown): CheckRow {
  const title = "Bazaar schema references";
  const schema = bazaarOf(payment)?.schema;
  if (!schema || typeof schema !== "object") {
    return row("schema_refs", title, "na", "Not applicable. There is no Bazaar schema to read for $ref or $id.");
  }
  const hits: string[] = [];
  walkExternalSchema(schema, hits);
  if (hits.length === 0) {
    return row(
      "schema_refs",
      title,
      "pass",
      "Schema $ref and $id values are same-document pointers, or there are none. External references are the ones that get dropped.",
    );
  }
  const shown = hits.slice(0, 3).join("; ");
  return row(
    "schema_refs",
    title,
    "fail",
    `The Bazaar schema has an external $ref or $id (${shown}). Facilitators only allow same-document pointers that start with #. They do not fetch outside references.`,
    "Put the schema in the document. $ref and $id must start with #.",
  );
}

export type ExampleCall = {
  method: "GET" | "POST";
  search: string;
  body?: string;
};

export function exampleCallOf(payment: unknown): ExampleCall | "mcp" | "none" {
  const input = bag(bag(bazaarOf(payment)?.info)?.input);
  if (!input) return "none";
  if (input.type === "mcp") return "mcp";
  const methodRaw = typeof input.method === "string" ? input.method.toUpperCase() : "GET";
  if (methodRaw !== "GET" && methodRaw !== "POST") return "none";
  const params = bag(input.queryParams);
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        search.set(key, String(value));
      }
    }
  }
  let body: string | undefined;
  if (methodRaw === "POST" && input.body !== undefined) {
    const encoded = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    body = encoded.slice(0, 8000);
  }
  return { method: methodRaw, search: search.toString(), body };
}

export function checkExample(status: number | null, note: "pass-or-status" | "none" | "mcp" | "error"): CheckRow {
  const title = "Example input";
  if (note === "none") {
    return row("example_input", title, "unchecked", "Could not check. The 402 has no extensions.bazaar.info.input example to replay.");
  }
  if (note === "mcp") {
    return row("example_input", title, "na", "Not applicable. The Bazaar input is an MCP tool, not an HTTP example to replay.");
  }
  if (note === "error" || status == null) {
    return row("example_input", title, "unchecked", "Could not replay the example input.");
  }
  if (status === 402) {
    return row("example_input", title, "pass", "The example input returned HTTP 402, which is what a catalog probe needs.");
  }
  if (status === 400 || status === 409) {
    return row(
      "example_input",
      title,
      "fail",
      `The example input returned HTTP ${status} instead of 402. Facilitators replay extensions.bazaar.info.input. A 400 or 409 means that probe never sees a payment requirement. Return 402 for that example.`,
    );
  }
  return row(
    "example_input",
    title,
    "warn",
    `The example input returned HTTP ${status}, not 402. This check flags 400 and 409, which stop a catalog probe before payment.`,
  );
}

export const CORS_EXPOSE_ISSUE = "https://github.com/x402-foundation/x402/issues/3808";
export const HEAD_SAFE_ISSUE = "https://github.com/x402-foundation/x402/issues/3810";
export const CORS_EXPOSE_TITLE = "Browser price header";
export const HEAD_SAFE_TITLE = "HEAD request";

export type CorsSeen = {
  allowOrigin: string | null;
  exposeHeaders: string | null;
};

function headerTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** True when Access-Control-Expose-Headers lists PAYMENT-REQUIRED or `*`. */
export function exposesPaymentRequired(value: string | null | undefined): boolean {
  const tokens = headerTokens(value);
  return tokens.includes("payment-required") || tokens.includes("*");
}

/**
 * Browser buyers can read PAYMENT-REQUIRED only when the seller exposes it.
 * No CORS headers at all is not a fail: say that a browser agent cannot pay.
 */
export function checkCorsExpose(seen: readonly CorsSeen[]): CheckRow {
  const title = CORS_EXPOSE_TITLE;
  const exposes = seen.some((row) => exposesPaymentRequired(row.exposeHeaders));
  const allowsOrigin = seen.some((row) => Boolean(row.allowOrigin?.trim()));
  const anyCors = seen.some(
    (row) => Boolean(row.allowOrigin?.trim()) || Boolean(row.exposeHeaders?.trim()),
  );
  if (exposes) {
    const star = seen.some((row) => headerTokens(row.exposeHeaders).includes("*"));
    const how = star
      ? "Access-Control-Expose-Headers is *, so a browser can read the price."
      : "Access-Control-Expose-Headers includes PAYMENT-REQUIRED, so a browser can read the price.";
    return row("cors_expose", title, "pass", `${how} ${CORS_EXPOSE_ISSUE}`);
  }
  if (allowsOrigin) {
    return row(
      "cors_expose",
      title,
      "warn",
      `Browser buyers can't see your price. Access-Control-Allow-Origin is set, but Access-Control-Expose-Headers does not include PAYMENT-REQUIRED. ${CORS_EXPOSE_ISSUE}`,
      "Add PAYMENT-REQUIRED to Access-Control-Expose-Headers.",
    );
  }
  if (anyCors) {
    return row(
      "cors_expose",
      title,
      "warn",
      `Browser buyers can't see your price. Access-Control-Expose-Headers does not include PAYMENT-REQUIRED. ${CORS_EXPOSE_ISSUE}`,
      "Add PAYMENT-REQUIRED to Access-Control-Expose-Headers.",
    );
  }
  return row(
    "cors_expose",
    title,
    "na",
    `No CORS headers. Browser agents won't be able to pay this endpoint. ${CORS_EXPOSE_ISSUE}`,
  );
}

export function checkHeadSafe(input: { status: number | null; skipped?: "post" }): CheckRow {
  const title = HEAD_SAFE_TITLE;
  if (input.skipped === "post") {
    return row(
      "head_safe",
      title,
      "na",
      `Not applicable. The paid route answered on POST, not GET. A HEAD request does not match that route. ${HEAD_SAFE_ISSUE}`,
    );
  }
  if (input.status == null || input.status <= 0) {
    return row(
      "head_safe",
      title,
      "unchecked",
      `Could not check. The HEAD request did not answer. ${HEAD_SAFE_ISSUE}`,
    );
  }
  if (input.status >= 200 && input.status < 300) {
    const code = input.status === 200 ? "200" : String(input.status);
    return row(
      "head_safe",
      title,
      "warn",
      `A HEAD request gets a ${code} without paying. Some buyer tools may get charged for nothing, or you're giving away the route. ${HEAD_SAFE_ISSUE}`,
      "Answer HEAD with 402, 405, or 404. Do not return 200 for a paid route.",
    );
  }
  const nice =
    input.status === 402
      ? "HEAD returned HTTP 402, which is the payment challenge, not a free success."
      : `HEAD returned HTTP ${input.status}, not a free success.`;
  return row("head_safe", title, "pass", `${nice} ${HEAD_SAFE_ISSUE}`);
}

/**
 * Free check. Paid report adds version fields, query string, trailing slash, payTo,
 * merchant list, search, the snippet, directory, and Coinbase's validate call.
 */
export const FREE_CHECK_IDS = [
  "reply_shape",
  "header_size",
  "resource_https",
  "bazaar",
  "dropped_fields",
  "example_input",
  "schema_refs",
  "cors_expose",
  "head_safe",
] as const;
