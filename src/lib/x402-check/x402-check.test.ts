import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { handleMcpPost } from "../mcp/handle.ts";
import { MCP_MARKETPLACE_TOOLS, MCP_TOOLS } from "../mcp/tools.ts";
import { BASE_USDC } from "../meter/accepts.ts";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import type { ListingQuery } from "../directory/listings.ts";
import {
  checkBazaar,
  checkCorsExpose,
  checkDroppedFields,
  checkExample,
  checkHeadSafe,
  checkHeaderSize,
  CORS_EXPOSE_ISSUE,
  HEADER_SIZE_ISSUE,
  HEAD_SAFE_ISSUE,
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
  type CheckRow,
} from "./checks.ts";
import {
  X402_CHECK_CAVEAT,
  X402_CHECK_HONESTY,
  X402_CHECK_LINE,
  X402_CHECK_PRICE_USD,
  X402_CHECK_SKU,
  X402_CHECK_VALIDATOR_LINE,
} from "./copy.ts";
import { runX402ListingCheckTool } from "./mcp.ts";
import { handleX402CheckRequest, handleX402ReportRequest } from "./http.ts";
import { measureRawHeaders, orderAddresses, pinLookup, probeEndpoint, type ProbeHop, type ProbeTransport } from "./probe.ts";
import { runListingCheck, type X402Report } from "./run.ts";
import { isBlockedIp, parsePublicHttpsUrl, SsrfError } from "./ssrf.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ORDERS = readFileSync(join(ROOT, "migrations/0038_x402_check_orders.sql"), "utf8");
const NOW = new Date("2026-10-11T12:00:00.000Z");
const URL = "https://api.example.com/v1/yield";
const PAY_BASE = "0x48d5A78d480B4C32dE319C2aEF69e682Dc304615";
const PAY_SOL = "9CAhY1vdaZfrfoto3KLQtRAo1dVWxNn5xAfmc2XbZVsf";
const BANNED = /guaranteed|\bsafe\b|endors|partner|escrow|\bhold\b|keep 10%|pay only when/i;

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 2,
    resource: {
      url: URL,
      description: "USDC yield",
      mimeType: "application/json",
      serviceName: "USDC yield",
      tags: ["usdc"],
    },
    accepts: [
      {
        scheme: "exact",
        network: "base",
        amount: "10000",
        asset: BASE_USDC,
        payTo: PAY_BASE,
        maxTimeoutSeconds: 60,
      },
      {
        scheme: "exact",
        network: "solana",
        amount: "10000",
        asset: USDC_MINT,
        payTo: PAY_SOL,
        maxTimeoutSeconds: 60,
      },
    ],
    extensions: {
      bazaar: {
        info: { input: { type: "http", method: "GET" }, output: { type: "json" } },
        schema: { type: "object" },
      },
    },
    ...overrides,
  };
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function hop(
  body: unknown,
  status = 402,
  contentType = "application/json",
  location?: string,
  extraHeaders?: Record<string, string> | null,
): ProbeHop {
  const extra =
    extraHeaders === null
      ? {}
      : (extraHeaders ?? {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "PAYMENT-REQUIRED",
        });
  const json = JSON.stringify(body);
  return {
    status,
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        if (key === "content-type") return contentType;
        if (key === "payment-required" && status === 402) return encode(body);
        if (key === "location" && location) return location;
        for (const [header, value] of Object.entries(extra)) {
          if (header.toLowerCase() === key) return value;
        }
        return null;
      },
    },
    body: Buffer.from(json),
  };
}

function transportFor(body: unknown, status = 402): ProbeTransport {
  return async () => hop(body, status);
}

const publicLookup = async () => ["1.1.1.1"];

function post(path: string, body: unknown, ip = "203.0.113.10") {
  return new Request(`https://agent-control.net${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

function fullReport(): X402Report {
  return {
    product: "x402_listing_check",
    tier: "full",
    input: { url: URL },
    checks: [
      { id: "v2_fields", title: "x402 version 2 fields", status: "pass", detail: "ok" },
      { id: "snippet", title: "Copy-paste snippet", status: "pass", detail: "ok", fix: "{}" },
    ],
    passed: 2,
    failed: 0,
    warned: 0,
    unchecked: 0,
    not_applicable: 0,
    caveat: X402_CHECK_CAVEAT,
    summary: "2 passed.",
    validator: X402_CHECK_VALIDATOR_LINE,
    fetched: { status: 402, final_url: URL, content_type: "application/json" },
  };
}

describe("ssrf", () => {
  const blocked = [
    "http://example.com/pay",
    "https://user:pass@example.com/pay",
    "https://example.com:8443/pay",
    "https://localhost/pay",
    "https://127.0.0.1/pay",
    "https://10.1.2.3/pay",
    "https://192.168.1.9/pay",
    "https://172.16.4.4/pay",
    "https://169.254.169.254/latest",
    "https://[::1]/pay",
    "https://[::ffff:127.0.0.1]/pay",
    "https://[fd00:ec2::254]/pay",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://foo.local/pay",
    "https://foo.internal/pay",
  ];

  for (const raw of blocked) {
    it(`rejects ${raw}`, () => {
      assert.throws(() => parsePublicHttpsUrl(raw), SsrfError);
    });
  }

  it("blocks private, loopback, link-local, and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.8", "192.168.0.1", "172.16.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fd00:ec2::254"]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
    assert.equal(isBlockedIp("1.1.1.1"), false);
    assert.equal(isBlockedIp("8.8.8.8"), false);
  });

  it("does not follow a redirect onto a private address", async () => {
    let calls = 0;
    const transport: ProbeTransport = async (input) => {
      calls += 1;
      assert.equal(input.url.hostname, "api.example.com");
      return hop({}, 302, "text/plain", "https://169.254.169.254/latest/meta-data");
    };
    await assert.rejects(
      () => probeEndpoint(URL, { lookup: publicLookup, transport }),
      /not a public address/,
    );
    assert.equal(calls, 1);
  });

  it("pins the address in the shape Node's HTTP client expects", () => {
    assert.deepEqual(orderAddresses(["2606:4700::1", "1.1.1.1"]), ["1.1.1.1", "2606:4700::1"]);
    const listed = pinLookup("1.1.1.1");
    let allResult: unknown;
    listed("example.com", { all: true }, (_err, address) => {
      allResult = address;
    });
    assert.deepEqual(allResult, [{ address: "1.1.1.1", family: 4 }]);
  });

  it("rejects a host that resolves to a public and a private address", async () => {
    let calls = 0;
    const transport: ProbeTransport = async () => {
      calls += 1;
      return hop(payment());
    };
    await assert.rejects(
      () =>
        probeEndpoint(URL, {
          lookup: async () => ["1.1.1.1", "10.0.0.8"],
          transport,
        }),
      /not a public address/,
    );
    assert.equal(calls, 0);
  });
});

describe("listing checks", () => {
  it("passes a version-2 reply and fails stray v1 fields", () => {
    assert.equal(checkV2Fields(payment()).status, "pass");
    const v1 = payment();
    (v1.accepts as Array<Record<string, unknown>>)[0].maxAmountRequired = "10000";
    const failed = checkV2Fields(v1);
    assert.equal(failed.status, "fail");
    assert.match(failed.detail, /maxAmountRequired/);
  });

  it("rejects a query string and a trailing-slash mismatch", () => {
    const queried = payment({
      resource: { url: `${URL}?q=1`, description: "x", mimeType: "application/json" },
    });
    assert.equal(checkResourceUrl(queried, URL).status, "fail");
    assert.match(checkResourceUrl(queried, URL).detail, /query string/);
    const slashed = payment({
      resource: { url: `${URL}/`, description: "x", mimeType: "application/json" },
    });
    assert.match(checkResourceUrl(slashed, URL).detail, /trailing slash/);
    assert.equal(checkResourceUrl(payment(), URL).status, "pass");
  });

  it("requires bazaar, passes a fixed path without routeTemplate, and warns on :param", () => {
    const missing = payment();
    delete (missing as { extensions?: unknown }).extensions;
    assert.equal(checkBazaar(missing).status, "fail");
    assert.equal(checkBazaar(payment()).status, "pass");
    const templated = payment({
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "GET" } },
          schema: { type: "object" },
          routeTemplate: "/v1/markets/:id",
        },
      },
    });
    assert.equal(checkBazaar(templated).status, "warn");
    assert.match(checkBazaar(templated).detail, /:id/);
  });

  it("accepts known USDC targets and rejects a bad payTo", () => {
    assert.equal(checkTargets(payment(), null).status, "pass");
    assert.match(checkTargets(payment(), null).detail, /Other networks|Base USDC/);
    const extra = payment();
    (extra.accepts as unknown[]).push({
      scheme: "exact",
      network: "eip155:137",
      amount: "10000",
      asset: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      payTo: PAY_BASE,
      maxTimeoutSeconds: 60,
    });
    assert.equal(checkTargets(extra, null).status, "pass");
    assert.match(checkTargets(extra, null).detail, /eip155:137/);
    const bad = payment();
    (bad.accepts as unknown as Array<{ payTo: string }>)[0].payTo = "not-an-address";
    assert.equal(checkTargets(bad, null).status, "fail");
    assert.equal(checkTargets(null, PAY_BASE).status, "warn");
    assert.equal(checkTargets(null, "nope").status, "fail");
  });

  it("checks the 402 status and content type", () => {
    const probe = {
      ok: true as const,
      status: 402,
      method: "GET" as const,
      route: "payment" as const,
      contentType: "application/json",
      finalUrl: URL,
      headerRaw: "e30",
      bodyText: "{}",
      payment: payment(),
      paymentSource: "header" as const,
      decodeError: null,
      paymentRequiredBytes: 3,
      responseHeaderBytes: null,
      headersOverflow: false,
      corsAllowOrigin: "*",
      corsExposeHeaders: "PAYMENT-REQUIRED",
    };
    assert.match(checkReplyShape(probe).detail, /PAYMENT-REQUIRED/);
    const other = checkReplyShape({ ...probe, status: 200, payment: null, paymentSource: null });
    assert.equal(other.status, "unchecked");
    assert.match(other.detail, /Not an HTTP 402 endpoint — could not check/);
    assert.equal(checkReplyShape({ ...probe, contentType: "text/plain" }).status, "warn");
    assert.equal(checkReplyShape(null).status, "unchecked");
    assert.match(checkReplyShape(null).detail, /Could not check — paste the endpoint URL/);
    const mcp = checkReplyShape({ ...probe, status: 406, route: "mcp", payment: null, paymentSource: null });
    assert.equal(mcp.status, "unchecked");
    assert.match(mcp.detail, /Not an HTTP 402 endpoint — could not check/);
  });

  it("reads the merchant list without guessing when the lookup fails", () => {
    const hit = checkMerchant(payment(), [{ payTo: PAY_BASE, state: "ok", resources: [URL] }], null);
    assert.equal(hit.status, "pass");
    const other = checkMerchant(
      payment(),
      [{ payTo: PAY_BASE, state: "ok", resources: ["https://api.example.com/v1/other"] }],
      null,
    );
    assert.equal(other.status, "fail");
    const down = checkMerchant(payment(), [{ payTo: PAY_BASE, state: "error", resources: [] }], null);
    assert.equal(down.status, "unchecked");
    assert.match(down.detail, /Could not check/);
  });

  it("separates indexed-but-hidden from not indexed", () => {
    const both = checkSearch(payment(), [
      { curatedOnly: false, state: "ok", partial: false, resources: [URL] },
      { curatedOnly: true, state: "ok", partial: false, resources: [URL] },
    ]);
    assert.equal(both.status, "pass");
    const hidden = checkSearch(payment(), [
      { curatedOnly: false, state: "ok", partial: false, resources: [URL] },
      { curatedOnly: true, state: "ok", partial: false, resources: [] },
    ]);
    assert.equal(hidden.status, "warn");
    assert.match(hidden.detail, /curated/);
    const missing = checkSearch(payment(), [
      { curatedOnly: false, state: "ok", partial: false, resources: [] },
      { curatedOnly: true, state: "ok", partial: false, resources: [] },
    ]);
    assert.equal(missing.status, "fail");
    const down = checkSearch(payment(), [
      { curatedOnly: false, state: "error", partial: false, resources: [] },
      { curatedOnly: true, state: "ok", partial: false, resources: [] },
    ]);
    assert.equal(down.status, "unchecked");
    const partial = checkSearch(payment(), [
      { curatedOnly: false, state: "ok", partial: true, resources: [] },
      { curatedOnly: true, state: "ok", partial: false, resources: [] },
    ]);
    assert.equal(partial.status, "unchecked");
  });

  it("writes a snippet for the missing resource and bazaar fields", () => {
    const row = checkSnippet(null, `${URL}?q=1`);
    assert.equal(row.status, "fail");
    assert.match(row.fix ?? "", /"routeTemplate": "\/v1\/yield"/);
    assert.doesNotMatch(row.fix ?? "", /\?q=/);
    assert.equal(checkSnippet(payment(), URL).status, "pass");
    assert.equal(checkSnippet(null, null).status, "na");
  });

  it("flags http resource urls, long descriptions, and external schema refs", () => {
    const http = payment({
      resource: { url: "http://api.example.com/v1/yield", description: "x", mimeType: "application/json" },
    });
    assert.equal(checkResourceHttps(http).status, "fail");
    assert.match(checkResourceHttps(http).detail, /http:\/\//);
    assert.equal(checkResourceHttps(payment()).status, "pass");
    assert.equal(checkResourceUrl(http, URL).status, "pass");

    const long = payment({
      resource: { url: URL, description: "x".repeat(501), mimeType: "application/json" },
    });
    const described = checkDroppedFields(long);
    assert.equal(described.status, "fail");
    assert.match(described.detail, /501/);
    assert.match(described.fix ?? "", /Shorten the description to 500 characters or fewer/);
    assert.equal(checkDroppedFields(payment()).status, "pass");

    const external = payment({
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "GET" }, output: { type: "json" } },
          schema: { $id: "https://example.com/schema", properties: { input: { $ref: "https://example.com/in.json" } } },
        },
      },
    });
    const schema = checkSchemaRefs(external);
    assert.equal(schema.status, "fail");
    assert.match(schema.detail, /\$ref/);
    assert.match(schema.fix ?? "", /\$ref and \$id must start with #/);
    const local = payment({
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "GET" }, output: { type: "json" } },
          schema: { $id: "#", properties: { input: { $ref: "#/$defs/input" } } },
        },
      },
    });
    assert.equal(checkSchemaRefs(local).status, "pass");
    assert.equal(checkExample(400, "pass-or-status").status, "fail");
    assert.equal(checkExample(409, "pass-or-status").status, "fail");
    assert.equal(checkExample(402, "pass-or-status").status, "pass");
    assert.equal(checkExample(200, "pass-or-status").status, "warn");
  });

  it("lints fields Coinbase may drop: name, tags, and icon", () => {
    const longName = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "N".repeat(33),
        tags: ["usdc"],
      },
    });
    const named = checkDroppedFields(longName);
    assert.equal(named.status, "fail");
    assert.match(named.detail, /33 characters/);
    assert.match(named.fix ?? "", /32 plain ASCII characters or fewer/);

    const fancyName = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "Yield café",
      },
    });
    assert.equal(checkDroppedFields(fancyName).status, "fail");
    assert.match(checkDroppedFields(fancyName).detail, /plain ASCII/);

    const manyTags = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        tags: ["a", "b", "c", "d", "e", "f"],
      },
    });
    const tagged = checkDroppedFields(manyTags);
    assert.equal(tagged.status, "fail");
    assert.match(tagged.detail, /6 tags/);
    assert.match(tagged.fix ?? "", /Keep 5 tags or fewer/);

    const longTag = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        tags: ["t".repeat(33)],
      },
    });
    assert.equal(checkDroppedFields(longTag).status, "fail");

    const httpIcon = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        tags: ["usdc"],
        iconUrl: "http://cdn.example.com/icon.png",
      },
    });
    const http = checkDroppedFields(httpIcon);
    assert.equal(http.status, "warn");
    assert.match(http.detail, /Sellers report/);
    assert.match(http.fix ?? "", /Change iconUrl to https/);

    const oddIcon = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        tags: ["usdc"],
        iconUrl: "https://cdn.example.com/icon.html",
      },
    });
    const odd = checkDroppedFields(oddIcon);
    assert.equal(odd.status, "warn");
    assert.match(odd.detail, /Sellers report/);
    assert.match(odd.fix ?? "", /png, jpg/);

    const localIcon = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        tags: ["usdc"],
        iconUrl: "https://127.0.0.1/icon.png",
      },
    });
    assert.equal(checkDroppedFields(localIcon).status, "fail");
    assert.match(checkDroppedFields(localIcon).detail, /local or numeric host/);

    const dataIcon = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "USDC yield",
        iconUrl: "data:image/png;base64,aaaa",
      },
    });
    assert.equal(checkDroppedFields(dataIcon).status, "fail");

    const goodIcon = payment({
      resource: {
        url: URL,
        description: "USDC yield",
        mimeType: "application/json",
        serviceName: "A".repeat(32),
        tags: ["one", "two", "three", "four", "five"],
        iconUrl: "https://cdn.example.com/icon.png",
      },
    });
    assert.equal(checkDroppedFields(goodIcon).status, "pass");
  });

  it("reports directory and registry presence, and validate failures honestly", () => {
    assert.equal(
      checkPresence({ directory: { names: ["Ada"] }, registry: { listed: true } }).status,
      "pass",
    );
    assert.equal(
      checkPresence({ directory: { names: [] }, registry: { listed: false } }).status,
      "fail",
    );
    assert.equal(checkPresence({ directory: null, registry: null }).status, "unchecked");
    assert.equal(checkValidate(payment(), { state: "error" }).status, "unchecked");
    assert.equal(checkValidate(payment(), { state: "ok", valid: false, outcome: null, failed: ["missing bazaar"] }).status, "fail");
    const long = payment({
      resource: {
        url: URL,
        description: "x".repeat(501),
        mimeType: "application/json",
        tags: ["a", "b", "c", "d", "e", "f"],
      },
    });
    assert.equal(checkValidate(long, { state: "ok", valid: true, outcome: "accepted", failed: [] }).status, "warn");
  });
});

describe("price header size", () => {
  it("counts the PAYMENT-REQUIRED value and the header lines", () => {
    const value = "abc";
    const measured = measureRawHeaders(["PAYMENT-REQUIRED", value, "Content-Type", "application/json"]);
    assert.equal(measured.paymentRequiredBytes, 3);
    assert.equal(
      measured.responseHeaderBytes,
      Buffer.byteLength(`PAYMENT-REQUIRED: ${value}\r\n`) + Buffer.byteLength("Content-Type: application/json\r\n"),
    );
  });

  it("passes at 8190 bytes and warns above it", () => {
    const under = checkHeaderSize({ paymentRequiredBytes: 8190, responseHeaderBytes: 9000 });
    assert.equal(under.status, "pass");
    assert.equal(under.payment_required_bytes, 8190);
    assert.equal(under.response_header_bytes, 9000);
    assert.match(under.detail, /PAYMENT-REQUIRED is 8190 bytes/);
    assert.doesNotMatch(under.detail, /Python|Node fetch/);

    const warn = checkHeaderSize({ paymentRequiredBytes: 8191, responseHeaderBytes: 9000 });
    assert.equal(warn.status, "warn");
    assert.equal(warn.payment_required_bytes, 8191);
    assert.equal(warn.response_header_bytes, 9000);
    assert.deepEqual(warn.largest_parts, []);
    assert.equal(warn.body_has_requirements, false);
    assert.match(warn.detail, /PAYMENT-REQUIRED is 8191 bytes/);
    assert.match(warn.detail, /Some Python buyers can't read it/);
    assert.match(warn.detail, /did not decode/);
    assert.match(warn.detail, /does not carry the payment requirements/);
    assert.match(warn.detail, new RegExp(HEADER_SIZE_ISSUE.replaceAll(".", "\\.")));
    assert.equal(under.largest_parts, undefined);
    assert.equal(under.body_has_requirements, undefined);
  });

  it("fails above 16384 bytes on the price header or the whole header block", () => {
    const header = checkHeaderSize({ paymentRequiredBytes: 16385, responseHeaderBytes: 17000 });
    assert.equal(header.status, "fail");
    assert.equal(header.payment_required_bytes, 16385);
    assert.equal(header.response_header_bytes, 17000);
    assert.match(header.detail, /PAYMENT-REQUIRED is 16385 bytes/);
    assert.match(header.detail, /Node fetch buyers can't read it either/);
    assert.match(header.detail, new RegExp(HEADER_SIZE_ISSUE.replaceAll(".", "\\.")));

    const total = checkHeaderSize({ paymentRequiredBytes: 100, responseHeaderBytes: 16385 });
    assert.equal(total.status, "fail");
    assert.equal(total.payment_required_bytes, 100);
    assert.equal(total.response_header_bytes, 16385);
    assert.match(total.detail, /Response headers are 16385 bytes/);
    assert.match(total.detail, /Node fetch buyers can't read it either/);

    const edge = checkHeaderSize({ paymentRequiredBytes: 16384, responseHeaderBytes: 16384 });
    assert.equal(edge.status, "warn");
    assert.equal(edge.payment_required_bytes, 16384);
  });

  it("names the three largest pieces and whether the body carries the price", () => {
    const description = "d".repeat(600);
    const example = { quote: "e".repeat(1500) };
    const schema = { type: "object", properties: { holdings: { type: "string", description: "s".repeat(4000) } } };
    const doc = payment({
      resource: {
        url: URL,
        description,
        mimeType: "application/json",
      },
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "GET" }, output: { type: "json", example } },
          schema,
        },
      },
    });
    const total = Buffer.byteLength(JSON.stringify(doc));
    const schemaBytes = Buffer.byteLength(JSON.stringify(schema));
    const exampleBytes = Buffer.byteLength(JSON.stringify(example));
    const descriptionBytes = Buffer.byteLength(JSON.stringify(description));

    const warned = checkHeaderSize({
      paymentRequiredBytes: 8191,
      responseHeaderBytes: 9000,
      payment: doc,
      bodyHasRequirements: true,
    });
    assert.equal(warned.status, "warn");
    assert.equal(warned.body_has_requirements, true);
    assert.deepEqual(
      warned.largest_parts?.map((part) => part.path),
      ["extensions.bazaar.schema", "extensions.bazaar.info.output.example", "resource.description"],
    );
    assert.equal(warned.largest_parts?.[0]?.bytes, schemaBytes);
    assert.equal(warned.largest_parts?.[1]?.bytes, exampleBytes);
    assert.equal(warned.largest_parts?.[2]?.bytes, descriptionBytes);
    assert.equal(warned.largest_parts?.[0]?.share, Math.round((schemaBytes / total) * 10_000) / 10_000);
    assert.ok((warned.largest_parts?.[0]?.share ?? 0) >= 0.5);
    assert.ok((warned.largest_parts?.[0]?.bytes ?? 0) > (warned.largest_parts?.[1]?.bytes ?? 0));
    assert.match(warned.detail, /Most of your price header is the input schema \(\d+%, [\d,]+ bytes\)/);
    assert.match(warned.detail, /output example \(\d+%, [\d,]+ bytes\)/);
    assert.match(warned.detail, /description \(\d+%, [\d,]+ bytes\)/);
    assert.match(warned.detail, /Trimming it gets you under the limit/);
    assert.match(warned.detail, /402 body also carries the payment requirements/);
    assert.match(warned.detail, /Some Python buyers can't read it/);

    const hidden = checkHeaderSize({
      paymentRequiredBytes: 16385,
      responseHeaderBytes: 17000,
      payment: doc,
      bodyHasRequirements: false,
    });
    assert.equal(hidden.status, "fail");
    assert.equal(hidden.body_has_requirements, false);
    assert.equal(hidden.largest_parts?.[0]?.path, "extensions.bazaar.schema");
    assert.match(hidden.detail, /Node fetch buyers can't read it either/);
    assert.match(hidden.detail, /does not carry the payment requirements/);
    assert.match(hidden.detail, /Trimming it gets you under the limit/);
  });

  it("puts the byte count on the free check and points a too-big header at Fix", async () => {
    function sized(bytes: number, total: number): ProbeTransport {
      return async () => {
        const value = "a".repeat(bytes);
        const base = hop(payment());
        return {
          status: 402,
          headers: {
            get(name: string) {
              if (name.toLowerCase() === "payment-required") return value;
              return base.headers.get(name);
            },
          },
          body: base.body,
          paymentRequiredBytes: bytes,
          responseHeaderBytes: total,
        };
      };
    }

    const under = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: sized(100, 400) },
    );
    const underRow = under.checks.find((check) => check.id === "header_size");
    assert.equal(underRow?.status, "pass");
    assert.equal(underRow?.payment_required_bytes, 100);
    assert.equal(underRow?.response_header_bytes, 400);
    const underResponse = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.91"),
      null,
      { runFree: async () => under },
      NOW,
    );
    const underBody = (await underResponse.json()) as {
      checks: CheckRow[];
      next: { ship?: { href: string; fix_usd: number } };
    };
    assert.equal(underBody.checks.find((check) => check.id === "header_size")?.payment_required_bytes, 100);
    assert.equal(underBody.next.ship, undefined);

    const warned = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: sized(8191, 9000) },
    );
    assert.equal(warned.failed, 0);
    assert.equal(warned.checks.find((check) => check.id === "header_size")?.status, "warn");
    const warnResponse = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.92"),
      null,
      { runFree: async () => warned },
      NOW,
    );
    const warnBody = (await warnResponse.json()) as {
      checks: CheckRow[];
      failed: number;
      next: { ship?: { href: string; line: string; fix_usd: number } };
    };
    assert.equal(warnBody.failed, 0);
    const warnHeader = warnBody.checks.find((check) => check.id === "header_size");
    assert.equal(warnHeader?.payment_required_bytes, 8191);
    assert.deepEqual(warnHeader?.largest_parts, []);
    assert.equal(warnHeader?.body_has_requirements, true);
    assert.match(warnHeader?.detail ?? "", /did not decode/);
    assert.match(warnHeader?.detail ?? "", /body also carries the payment requirements/);
    assert.equal(warnBody.next.ship?.href, "/ship");
    assert.equal(warnBody.next.ship?.line, "Ship to paid");
    assert.equal(warnBody.next.ship?.fix_usd, 149);

    const failed = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: sized(16385, 17000) },
    );
    assert.ok(failed.failed >= 1);
    assert.equal(failed.checks.find((check) => check.id === "header_size")?.status, "fail");
    const failResponse = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.93"),
      null,
      { runFree: async () => failed },
      NOW,
    );
    const failBody = (await failResponse.json()) as {
      checks: CheckRow[];
      next: { ship?: { href: string; fix_usd: number } };
    };
    assert.equal(failBody.checks.find((check) => check.id === "header_size")?.payment_required_bytes, 16385);
    assert.equal(failBody.next.ship?.href, "/ship");
    assert.equal(failBody.next.ship?.fix_usd, 149);
  });

  it("reports the decoded pieces from a real PAYMENT-REQUIRED header and still offers Fix", async () => {
    const doc = payment({
      resource: {
        url: URL,
        description: "d".repeat(450),
        mimeType: "application/json",
      },
      extensions: {
        bazaar: {
          info: {
            input: { type: "http", method: "GET" },
            output: { type: "json", example: { quote: "e".repeat(1500) } },
          },
          schema: { type: "object", properties: { holdings: { type: "string", description: "s".repeat(7000) } } },
        },
      },
    });
    const encodedBytes = Buffer.byteLength(encode(doc));
    assert.ok(encodedBytes > 8190);
    assert.ok(encodedBytes <= 16384);

    const warned = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor(doc) },
    );
    const row = warned.checks.find((check) => check.id === "header_size");
    assert.equal(warned.failed, 0);
    assert.equal(row?.status, "warn");
    assert.equal(row?.body_has_requirements, true);
    assert.deepEqual(
      row?.largest_parts?.map((part) => part.path),
      ["extensions.bazaar.schema", "extensions.bazaar.info.output.example", "resource.description"],
    );
    assert.match(row?.detail ?? "", /Most of your price header is the input schema \(\d+%, [\d,]+ bytes\)/);
    assert.match(row?.detail ?? "", /Trimming it gets you under the limit/);

    const response = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.94"),
      null,
      { runFree: async () => warned },
      NOW,
    );
    const body = (await response.json()) as {
      checks: CheckRow[];
      next: { ship?: { href: string; fix_usd: number; keep_usd: number } };
    };
    const header = body.checks.find((check) => check.id === "header_size");
    assert.equal(header?.body_has_requirements, true);
    assert.equal(header?.largest_parts?.[0]?.path, "extensions.bazaar.schema");
    assert.equal(typeof header?.largest_parts?.[0]?.share, "number");
    assert.equal(body.next.ship?.href, "/ship");
    assert.equal(body.next.ship?.fix_usd, 149);
    assert.equal(body.next.ship?.keep_usd, 29);

    const hidden = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      {
        lookup: publicLookup,
        transport: async () => {
          const base = hop(doc);
          return {
            ...base,
            body: Buffer.from("Payment required"),
            headers: {
              get(name: string) {
                if (name.toLowerCase() === "content-type") return "text/plain";
                return base.headers.get(name);
              },
            },
          };
        },
      },
    );
    const hiddenRow = hidden.checks.find((check) => check.id === "header_size");
    assert.equal(hiddenRow?.status, "warn");
    assert.equal(hiddenRow?.body_has_requirements, false);
    assert.equal(hiddenRow?.largest_parts?.[0]?.path, "extensions.bazaar.schema");
    assert.match(hiddenRow?.detail ?? "", /does not carry the payment requirements/);
  });
});

function unpaid(input: { method: string; body?: string; headers?: Record<string, string> }) {
  assert.equal(input.body?.includes("payment") ?? false, false);
  const names = Object.keys(input.headers ?? {}).map((name) => name.toLowerCase());
  assert.equal(names.includes("payment-signature"), false);
  assert.equal(names.includes("payment-required"), false);
  assert.equal(names.includes("x-payment"), false);
}

describe("browser price header and HEAD", () => {
  it("passes when PAYMENT-REQUIRED is exposed, including a different case", () => {
    const row = checkCorsExpose([
      { allowOrigin: "*", exposeHeaders: "Payment-Required, WWW-Authenticate" },
    ]);
    assert.equal(row.id, "cors_expose");
    assert.equal(row.status, "pass");
    assert.match(row.detail, /PAYMENT-REQUIRED/);
    assert.match(row.detail, new RegExp(CORS_EXPOSE_ISSUE.replaceAll(".", "\\.")));
  });

  it("passes when Access-Control-Expose-Headers is *", () => {
    const row = checkCorsExpose([{ allowOrigin: "https://shop.example", exposeHeaders: " * " }]);
    assert.equal(row.status, "pass");
    assert.match(row.detail, /Access-Control-Expose-Headers is \*/);
    assert.match(row.detail, new RegExp(CORS_EXPOSE_ISSUE.replaceAll(".", "\\.")));
  });

  it("warns when allow-origin is set and the price header is not exposed", () => {
    const row = checkCorsExpose([{ allowOrigin: "*", exposeHeaders: "WWW-Authenticate" }]);
    assert.equal(row.status, "warn");
    assert.match(row.detail, /Browser buyers can't see your price/);
    assert.match(row.detail, new RegExp(CORS_EXPOSE_ISSUE.replaceAll(".", "\\.")));
    const missing = checkCorsExpose([{ allowOrigin: "https://shop.example", exposeHeaders: null }]);
    assert.equal(missing.status, "warn");
  });

  it("is not applicable when the seller sends no CORS headers", () => {
    const row = checkCorsExpose([{ allowOrigin: null, exposeHeaders: null }]);
    assert.ok(row.status === "na" || row.status === "unchecked");
    assert.match(row.detail, /Browser agents won't be able to pay/);
    assert.match(row.detail, new RegExp(CORS_EXPOSE_ISSUE.replaceAll(".", "\\.")));
  });

  it("passes HEAD 402 and 405, warns on 200, and leaves a network error unchecked", () => {
    const challenge = checkHeadSafe({ status: 402 });
    assert.equal(challenge.status, "pass");
    assert.match(challenge.detail, /402/);
    assert.match(challenge.detail, new RegExp(HEAD_SAFE_ISSUE.replaceAll(".", "\\.")));

    const missing = checkHeadSafe({ status: 405 });
    assert.equal(missing.status, "pass");
    assert.match(missing.detail, /405/);

    const gone = checkHeadSafe({ status: 404 });
    assert.equal(gone.status, "pass");

    const free = checkHeadSafe({ status: 200 });
    assert.equal(free.status, "warn");
    assert.match(free.detail, /A HEAD request gets a 200 without paying/);
    assert.match(free.detail, /Some buyer tools may get charged for nothing, or you're giving away the route/);
    assert.match(free.detail, new RegExp(HEAD_SAFE_ISSUE.replaceAll(".", "\\.")));

    const silent = checkHeadSafe({ status: null });
    assert.equal(silent.status, "unchecked");
    assert.match(silent.detail, /did not answer/);
  });

  it("reads expose from the 402 and does not send another request when it is already there", async () => {
    const calls: string[] = [];
    const transport: ProbeTransport = async (input) => {
      calls.push(input.method);
      unpaid(input);
      return hop(payment(), 402, "application/json", undefined, {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "PAYMENT-REQUIRED",
      });
    };
    const report = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    const cors = report.checks.find((check) => check.id === "cors_expose");
    const head = report.checks.find((check) => check.id === "head_safe");
    assert.equal(cors?.status, "pass");
    assert.equal(head?.status, "pass");
    assert.equal(calls.includes("OPTIONS"), false);
    assert.equal(calls.filter((method) => method === "HEAD").length, 1);
    assert.equal(report.checks.some((check) => check.status === "warn"), false);
  });

  it("reads the price header from an unpaid repeat when the preflight allows an origin", async () => {
    const calls: string[] = [];
    const transport: ProbeTransport = async (input) => {
      calls.push(`${input.method}${input.headers?.origin ? " origin" : ""}`);
      unpaid(input);
      if (input.method === "OPTIONS") {
        return hop({}, 204, "text/plain", undefined, { "access-control-allow-origin": "*" });
      }
      if (input.headers?.origin) {
        return hop(payment(), 402, "application/json", undefined, {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "PAYMENT-REQUIRED",
        });
      }
      if (input.method === "HEAD") return hop({}, 402, "text/plain", undefined, null);
      return hop(payment(), 402, "application/json", undefined, null);
    };
    const report = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    assert.equal(report.checks.find((check) => check.id === "cors_expose")?.status, "pass");
    assert.equal(calls.filter((call) => call.startsWith("OPTIONS")).length, 1);
    assert.ok(calls.some((call) => call === "GET origin"));
  });

  it("sends one unpaid OPTIONS preflight when the 402 has no CORS headers", async () => {
    const calls: string[] = [];
    const transport: ProbeTransport = async (input) => {
      calls.push(input.method);
      unpaid(input);
      if (input.method === "OPTIONS") {
        assert.equal(input.headers?.origin, "https://agent-control.net");
        assert.equal(input.body, undefined);
        return hop({ ok: true }, 204, "text/plain", undefined, null);
      }
      if (input.method === "HEAD") return hop(payment(), 402, "application/json", undefined, null);
      return hop(payment(), 402, "application/json", undefined, null);
    };
    const report = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    const cors = report.checks.find((check) => check.id === "cors_expose");
    assert.equal(cors?.status, "na");
    assert.match(cors?.detail ?? "", /Browser agents won't be able to pay/);
    assert.equal(calls.filter((method) => method === "OPTIONS").length, 1);
    assert.equal(calls.filter((method) => method === "HEAD").length, 1);
  });

  it("warns from allow-origin on the 402 and offers Fix at $149", async () => {
    const transport: ProbeTransport = async (input) => {
      unpaid(input);
      if (input.method === "HEAD") return hop({}, 402, "application/json", undefined, null);
      return hop(payment(), 402, "application/json", undefined, {
        "access-control-allow-origin": "*",
      });
    };
    const warned = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    const cors = warned.checks.find((check) => check.id === "cors_expose");
    assert.equal(cors?.status, "warn");
    assert.match(cors?.detail ?? "", /Browser buyers can't see your price/);
    assert.equal(warned.failed, 0);
    const response = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.94"),
      null,
      { runFree: async () => warned },
      NOW,
    );
    const body = (await response.json()) as {
      checks: CheckRow[];
      failed: number;
      next: { ship?: { href: string; line: string; fix_usd: number; keep_usd: number } };
    };
    assert.equal(body.failed, 0);
    assert.equal(body.checks.find((check) => check.id === "cors_expose")?.status, "warn");
    assert.equal(body.next.ship?.href, "/ship");
    assert.equal(body.next.ship?.line, "Ship to paid");
    assert.equal(body.next.ship?.fix_usd, 149);
    assert.equal(body.next.ship?.keep_usd, 29);
  });

  it("warns when HEAD is 200, passes 405, and leaves a dropped HEAD unchecked", async () => {
    async function runHead(status: number | "error") {
      const transport: ProbeTransport = async (input) => {
        unpaid(input);
        if (input.method === "HEAD") {
          assert.equal(input.body, undefined);
          if (status === "error") throw new Error("timed out");
          return hop({}, status, "text/plain", undefined, null);
        }
        return hop(payment(), 402, "application/json", undefined, {
          "access-control-expose-headers": "PAYMENT-REQUIRED",
          "access-control-allow-origin": "*",
        });
      };
      return runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    }

    const warned = await runHead(200);
    const head = warned.checks.find((check) => check.id === "head_safe");
    assert.equal(head?.status, "warn");
    assert.match(head?.detail ?? "", /A HEAD request gets a 200 without paying/);
    assert.equal(warned.failed, 0);
    const response = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.95"),
      null,
      { runFree: async () => warned },
      NOW,
    );
    const body = (await response.json()) as {
      next: { ship?: { href: string; fix_usd: number } };
    };
    assert.equal(body.next.ship?.href, "/ship");
    assert.equal(body.next.ship?.fix_usd, 149);

    const allowed = await runHead(405);
    assert.equal(allowed.checks.find((check) => check.id === "head_safe")?.status, "pass");

    const dropped = await runHead("error");
    const missed = dropped.checks.find((check) => check.id === "head_safe");
    assert.equal(missed?.status, "unchecked");
    assert.match(missed?.detail ?? "", /did not answer/);
    assert.equal(dropped.failed, 0);
  });

  it("skips HEAD when the paid route answered on POST", async () => {
    const calls: string[] = [];
    const declared = payment({
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "POST", body: {} }, output: { type: "json" } },
          schema: { type: "object" },
        },
      },
    });
    const transport: ProbeTransport = async (input) => {
      calls.push(input.method);
      unpaid(input);
      if (input.method === "GET") return hop({ missing: true }, 404, "application/json", undefined, null);
      if (input.method === "HEAD") return hop({}, 200, "text/plain", undefined, null);
      return hop(declared, 402, "application/json", undefined, {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "PAYMENT-REQUIRED",
      });
    };
    const report = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    const head = report.checks.find((check) => check.id === "head_safe");
    assert.equal(head?.status, "na");
    assert.match(head?.detail ?? "", /POST/);
    assert.match(head?.detail ?? "", new RegExp(HEAD_SAFE_ISSUE.replaceAll(".", "\\.")));
    assert.equal(calls.includes("HEAD"), false);
  });
});

describe("free and paid report", () => {
  it("passes a clean 402 on the free checks", async () => {
    const report = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor(payment()) },
    );
    assert.deepEqual(
      report.checks.map((check) => check.id),
      [
        "reply_shape",
        "header_size",
        "resource_https",
        "bazaar",
        "dropped_fields",
        "example_input",
        "schema_refs",
        "cors_expose",
        "head_safe",
      ],
    );
    assert.equal(report.failed, 0);
    assert.equal(report.checks.every((check) => check.status === "pass"), true);
    assert.equal(report.checks.some((check) => "fix" in check), false);
    const sized = report.checks.find((check) => check.id === "header_size");
    assert.equal(sized?.status, "pass");
    assert.equal(typeof sized?.payment_required_bytes, "number");
    assert.ok((sized?.payment_required_bytes ?? 0) <= 8190);
    assert.match(report.caveat, /does not mean Coinbase will list you/);
    assert.match(report.validator, /api\.cdp\.coinbase\.com\/platform\/v2\/x402\/validate/);
    assert.match(report.summary, /9 passed/);
    assert.doesNotMatch(report.summary, /fail/i);
    assert.doesNotMatch(`${report.caveat} ${report.validator} ${X402_CHECK_LINE} ${X402_CHECK_HONESTY}`, BANNED);
  });

  it("does not fail a wallet or an MCP URL when nothing payable was fetched", async () => {
    const wallet = await runListingCheck({ url: null, payTo: PAY_BASE }, "free");
    assert.equal(wallet.fetched, null);
    assert.equal(wallet.failed, 0);
    assert.equal(wallet.passed, 0);
    assert.equal(wallet.unchecked, wallet.checks.length);
    assert.doesNotMatch(wallet.summary, /fail/i);
    assert.match(wallet.summary, /Could not check — paste the endpoint URL/);
    for (const check of wallet.checks) {
      assert.equal(check.status, "unchecked");
      assert.match(check.detail, /Could not check — paste the endpoint URL/);
    }
    const viaTool = await runX402ListingCheckTool({ pay_to: PAY_BASE }, undefined, null);
    assert.equal(viaTool.ok, true);
    if (!viaTool.ok) return;
    const toolBody = viaTool.result as { checks: CheckRow[]; failed: number; summary: string };
    assert.equal(toolBody.failed, 0);
    assert.equal(toolBody.checks.some((check) => check.id === "dropped_fields"), true);
    assert.doesNotMatch(toolBody.summary, /fail/i);
    for (const check of toolBody.checks) assert.notEqual(check.status, "fail");

    const calls: string[] = [];
    const transport: ProbeTransport = async (input) => {
      calls.push(`${input.method} ${input.url.pathname}`);
      if (input.method === "GET") {
        return hop(
          { jsonrpc: "2.0", result: { isError: true, content: [] } },
          200,
          "application/json",
        );
      }
      return hop({ jsonrpc: "2.0", error: { code: -32601, message: "Unknown method." } }, 406, "application/json");
    };
    const mcp = await runListingCheck(
      { url: "https://api.seekapi.ai/mcp", payTo: null },
      "free",
      { lookup: publicLookup, transport },
    );
    assert.equal(mcp.fetched?.status, 200);
    assert.equal(mcp.failed, 0);
    assert.equal(mcp.checks.length, 1);
    assert.equal(mcp.checks[0]?.id, "not_402");
    assert.equal(mcp.checks[0]?.status, "unchecked");
    assert.match(mcp.checks[0]?.detail ?? "", /Not an HTTP 402 endpoint — could not check/);
    assert.doesNotMatch(mcp.summary, /fail/i);
    assert.equal(calls.length, 1);

    const denied = await runListingCheck(
      { url: "https://api.seekapi.ai/mcp", payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor({ error: "Not Acceptable" }, 406) },
    );
    assert.equal(denied.fetched?.status, 406);
    assert.equal(denied.checks.length, 1);
    assert.equal(denied.failed, 0);
    assert.match(denied.summary, /Not an HTTP 402 endpoint — could not check/);

    const other = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor({ ok: true }, 200) },
    );
    assert.equal(other.checks.length, 1);
    assert.equal(other.checks[0]?.status, "unchecked");
    assert.match(other.checks[0]?.detail ?? "", /Not an HTTP 402 endpoint — could not check/);
    assert.equal(other.failed, 0);
    assert.doesNotMatch(other.summary, /fail/i);
  });

  it("fails a long description and an external schema ref on the free result", async () => {
    const declared = payment({
      resource: { url: URL, description: "d".repeat(501), mimeType: "application/json", serviceName: "USDC yield" },
      extensions: {
        bazaar: {
          info: { input: { type: "http", method: "GET" }, output: { type: "json" } },
          schema: { properties: { input: { $ref: "https://example.com/in.json" } } },
        },
      },
    });
    const report = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor(declared) },
    );
    const dropped = report.checks.find((check) => check.id === "dropped_fields");
    const schema = report.checks.find((check) => check.id === "schema_refs");
    assert.equal(dropped?.status, "fail");
    assert.match(dropped?.fix ?? "", /Shorten the description to 500 characters or fewer/);
    assert.equal(schema?.status, "fail");
    assert.match(schema?.fix ?? "", /must start with #/);
    assert.ok(report.failed >= 2);
    assert.match(report.summary, /failed/);
  });

  it("fails an example input that returns 400 or 409 instead of 402", async () => {
    const declared = payment({
      extensions: {
        bazaar: {
          info: {
            input: { type: "http", method: "GET", queryParams: { city: "Paris" } },
            output: { type: "json" },
          },
          schema: { type: "object" },
        },
      },
    });
    const transport: ProbeTransport = async (input) => {
      if (input.url.searchParams.get("city") === "Paris") return hop({ error: "missing payment" }, 409, "application/json");
      return hop(declared, 402);
    };
    const report = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport },
    );
    const example = report.checks.find((check) => check.id === "example_input");
    assert.equal(example?.status, "fail");
    assert.match(example?.detail ?? "", /409/);
  });

  it("replays the example on the fetched https host", async () => {
    const declared = payment({
      resource: {
        url: "http://169.254.169.254/latest",
        description: "x",
        mimeType: "application/json",
      },
      extensions: {
        bazaar: {
          info: {
            input: { type: "http", method: "POST", body: { q: "1" } },
            output: { type: "json" },
          },
          schema: { type: "object" },
        },
      },
    });
    const seen: string[] = [];
    const transport: ProbeTransport = async (input) => {
      seen.push(`${input.method} ${input.url.href}`);
      assert.equal(input.url.protocol, "https:");
      assert.equal(input.url.hostname, "api.example.com");
      if (input.method === "POST" && input.body) return hop({ error: "bad example" }, 400, "application/json");
      return hop(declared, 402);
    };
    const report = await runListingCheck({ url: URL, payTo: null }, "free", { lookup: publicLookup, transport });
    assert.equal(report.checks.find((check) => check.id === "resource_https")?.status, "fail");
    assert.equal(report.checks.find((check) => check.id === "example_input")?.status, "fail");
    assert.match(report.checks.find((check) => check.id === "example_input")?.detail ?? "", /400/);
    assert.ok(seen.some((line) => line.startsWith("POST https://api.example.com/")));
    assert.equal(seen.some((line) => line.includes("169.254.169.254")), false);
  });

  it("adds the remote checks on the full report", async () => {
    const remote = async (url: string) => {
      if (url.includes("/merchant")) {
        return { status: 200, body: JSON.stringify({ resources: [{ resource: URL }] }) };
      }
      if (url.includes("curatedOnly=true")) {
        return { status: 200, body: JSON.stringify({ resources: [], partialResults: false }) };
      }
      if (url.includes("/search")) {
        return { status: 200, body: JSON.stringify({ resources: [{ resource: URL }], partialResults: false }) };
      }
      if (url.includes("/validate")) {
        return { status: 200, body: JSON.stringify({ valid: true, simulation: { outcome: "accepted" }, preflight: [] }) };
      }
      if (url.includes("registry.modelcontextprotocol.io")) {
        return { status: 200, body: JSON.stringify({ servers: [] }) };
      }
      return { status: 500, body: "" };
    };
    const report = await runListingCheck(
      { url: URL, payTo: null },
      "full",
      {
        lookup: publicLookup,
        transport: transportFor(payment()),
        remote,
        directory: async () => ({ names: [] }),
      },
    );
    assert.equal(report.checks.length, 17);
    const search = report.checks.find((check) => check.id === "search");
    assert.equal(search?.status, "warn");
    const snippet = report.checks.find((check) => check.id === "snippet");
    assert.ok(snippet?.fix);
  });

  it("returns the free JSON check and a locked $19 HTTP 402 invoice", async () => {
    const db = new PGlite();
    await db.exec(ORDERS);
    const sql = wrap(db);
    const free = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL, pay_to: "not-our-wallet", amount_usd: 49 }),
      sql,
      { runFree: async () => fullReport() },
      NOW,
    );
    assert.equal(free.status, 200);
    const freeBody = (await free.json()) as {
      checks: CheckRow[];
      next: { hire: { href: string }; ship?: { href: string } };
    };
    assert.equal(freeBody.checks.length, 2);
    assert.equal(freeBody.next.hire.href, "/hire");
    assert.equal(freeBody.next.ship, undefined);

    const failed = await handleX402CheckRequest(
      post("/api/v1/x402-check", { url: URL }, "203.0.113.77"),
      sql,
      {
        runFree: async () => ({
          ...fullReport(),
          failed: 1,
          checks: [{ id: "v2_fields", title: "x402 version 2 fields", status: "fail", detail: "missing" }],
        }),
      },
      NOW,
    );
    assert.equal(failed.status, 200);
    const failedBody = (await failed.json()) as {
      next: { ship?: { href: string; line: string; fix_usd: number; launch_usd: number; keep_usd: number } };
    };
    assert.equal(failedBody.next.ship?.href, "/ship");
    assert.equal(failedBody.next.ship?.line, "Ship to paid");
    assert.equal(failedBody.next.ship?.fix_usd, 149);
    assert.equal(failedBody.next.ship?.launch_usd, 399);
    assert.equal(failedBody.next.ship?.keep_usd, 29);

    const started = await handleX402ReportRequest(
      post("/api/v1/x402-check/report", { url: URL, pay_to: "not-our-wallet", amount_usd: 49 }),
      sql,
      {},
      NOW,
    );
    assert.equal(started.status, 402);
    const invoice = (await started.json()) as {
      invoice_id: string;
      sku: string;
      price_usd: number;
      amount_usd: number;
      amount_base_units: string;
      pay_to: string;
      base_pay_to: string;
      asset: string;
      accepts: Array<{ network: string; payTo: string; amount: string; asset: string }>;
      line: string;
      note: string;
      pay: string;
      status: string;
    };
    assert.equal(invoice.sku, X402_CHECK_SKU);
    assert.equal(invoice.price_usd, X402_CHECK_PRICE_USD);
    assert.equal(invoice.amount_usd, 19);
    assert.equal(invoice.amount_base_units, "19000000");
    assert.equal(invoice.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(invoice.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(invoice.asset, "usdc");
    assert.equal(invoice.accepts[0]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(invoice.accepts[1]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(invoice.accepts[0]?.amount, "19000000");
    assert.notEqual(invoice.pay_to, "not-our-wallet");
    assert.match(`${invoice.line} ${invoice.note} ${invoice.pay}`, /directly in USDC/);
    assert.doesNotMatch(`${invoice.line} ${invoice.note} ${invoice.pay}`, BANNED);

    const paid = await handleX402ReportRequest(
      post("/api/v1/x402-check/report", { invoice_id: invoice.invoice_id }),
      sql,
      {
        findPayment: async () => ({ kind: "paid", signature: "tx-sol", amountUsdc: 19 }),
        runReport: async () => fullReport(),
      },
      NOW,
    );
    assert.equal(paid.status, 200);
    const paidBody = (await paid.json()) as { status: string; runs_used: number; rechecks_left: number; report: { tier: string } };
    assert.equal(paidBody.status, "paid");
    assert.equal(paidBody.runs_used, 1);
    assert.equal(paidBody.rechecks_left, 1);
    assert.equal(paidBody.report.tier, "full");

    const again = await handleX402ReportRequest(
      post("/api/v1/x402-check/report", { invoice_id: invoice.invoice_id, recheck: true }),
      sql,
      { runReport: async () => fullReport() },
      NOW,
    );
    const second = (await again.json()) as { runs_used: number; rechecks_left: number };
    assert.equal(again.status, 200);
    assert.equal(second.runs_used, 2);
    assert.equal(second.rechecks_left, 0);

    const third = await handleX402ReportRequest(
      post("/api/v1/x402-check/report", { invoice_id: invoice.invoice_id, recheck: true }),
      sql,
      { runReport: async () => fullReport() },
      NOW,
    );
    assert.equal(third.status, 402);
    const closed = (await third.json()) as { error: string };
    assert.match(closed.error, /already used/);
  });

  it("refuses an unrecorded payment instead of asking for USDC", async () => {
    const empty = wrap(new PGlite());
    const response = await handleX402ReportRequest(post("/api/v1/x402-check/report", { url: URL }), empty, {}, NOW);
    assert.equal(response.status, 402);
    const body = (await response.json()) as { recorded: boolean; error: string; amount_base_units: string };
    assert.equal(body.recorded, false);
    assert.match(body.error, /Do not send USDC/);
    assert.equal(body.amount_base_units, "19000000");

    const missingDb = await handleX402ReportRequest(post("/api/v1/x402-check/report", { url: URL }), null, {}, NOW);
    assert.equal(missingDb.status, 402);
    const missingBody = (await missingDb.json()) as { recorded: boolean; error: string; amount_base_units: string };
    assert.equal(missingBody.recorded, false);
    assert.match(missingBody.error, /Do not send USDC/);
    assert.equal(missingBody.amount_base_units, "19000000");
  });
});

describe("discovery", () => {
  it("lists the page, the free tool, and the analytics events", async () => {
    const sitemap = readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    const page = readFileSync(join(ROOT, "src/routes/x402-check.tsx"), "utf8");
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/x402-check<\/loc>/);
    assert.match(llms, /https:\/\/agent-control\.net\/x402-check/);
    assert.match(
      llms,
      /List your agent free: POST \/api\/v1\/agents\/listings with name, skills, pitch, contact\. Browse: GET \/api\/v1\/agents\/listings\.\s*$/,
    );
    assert.match(page, /trackCheckRun/);
    assert.match(page, /trackReportStart/);
    assert.doesNotMatch(page, BANNED);

    const names = MCP_TOOLS.map((tool) => tool.name);
    assert.equal(names.indexOf("x402_listing_check"), names.indexOf("browse_agents") + 1);
    assert.equal((MCP_MARKETPLACE_TOOLS as readonly string[]).includes("x402_listing_check"), false);
    const res = await handleMcpPost(
      new Request("https://agent-control.net/api/v1/mcp", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
      }),
      { callTool: async () => ({ ok: false, status: 400, code: -32601, message: "Unknown tool." }) },
    );
    const rpc = (await res.json()) as { result: { instructions: string; tools?: unknown } };
    const instructions = rpc.result.instructions;
    const lookAt = instructions.indexOf("Can I pay this address?");
    for (const name of MCP_MARKETPLACE_TOOLS) {
      assert.ok(instructions.indexOf(name) < lookAt);
    }
    assert.match(instructions, /x402_listing_check/);
    assert.match(instructions, /does not mean Coinbase will list you/);
    assert.doesNotMatch(instructions, /First 5 free/);
  });
});
