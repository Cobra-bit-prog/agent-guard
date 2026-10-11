import { BASE_USDC, SOLANA_CAIP2 } from "../meter/accepts.ts";
import { USDC_MINT } from "../solana-pay.ts";
import type { EndpointProbe } from "./probe.ts";

export type CheckStatus = "pass" | "fail" | "warn" | "unchecked" | "na";

/** Why a check has no 402 body to read. Never reported as a fail. */
export type CheckAbsence = "wallet" | "mcp" | "not_402" | "undecoded";

export type CheckRow = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
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

export function absentCheck(id: string, title: string, why: CheckAbsence): CheckRow {
  if (why === "undecoded") {
    return row(id, title, "unchecked", "Could not check. The 402 did not include a payment object.");
  }
  if (why === "wallet") {
    return row(id, title, "na", "Not applicable. A wallet alone has nothing to fetch. Paste the https endpoint.");
  }
  if (why === "mcp") {
    return row(id, title, "na", "Not applicable. This is an MCP endpoint, not an x402 payment route.");
  }
  return row(id, title, "na", "Not applicable. The URL did not return a 402, so this check did not run.");
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
    return row(
      "reply_shape",
      title,
      "na",
      "Not applicable. A wallet alone has no 402 reply. Paste the https endpoint.",
    );
  }
  if (probe.route === "mcp") {
    return row(
      "reply_shape",
      title,
      "na",
      "This is an MCP endpoint, not an x402 payment route. Paste the paid route URL.",
    );
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

export function checkDescription(payment: unknown): CheckRow {
  const title = "Description length";
  const description = resourceOf(payment)?.description;
  if (typeof description !== "string") {
    return row("description_length", title, "pass", "No resource.description to measure. The 500-character limit does not apply.");
  }
  const length = description.length;
  if (length > DESCRIPTION_LIMIT) {
    return row(
      "description_length",
      title,
      "fail",
      `The description is ${length} characters. Coinbase's facilitator has rejected descriptions over ${DESCRIPTION_LIMIT} characters, so a settled payment can still miss the catalog. Shorten resource.description to ${DESCRIPTION_LIMIT} characters or fewer.`,
    );
  }
  return row("description_length", title, "pass", `The description is ${length} characters, within ${DESCRIPTION_LIMIT}.`);
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
    `The Bazaar schema has an external $ref or $id (${shown}). Facilitators only allow same-document pointers that start with #. Inline the schema. They do not fetch outside references.`,
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

/**
 * Free stays at five. Moved off the free tier onto the paid report: v2_fields,
 * resource_url (query string, trailing slash, host), and payment_targets.
 * schema_refs is paid. resource_https, description_length, and example_input are free.
 */
export const FREE_CHECK_IDS = [
  "reply_shape",
  "resource_https",
  "bazaar",
  "description_length",
  "example_input",
] as const;
