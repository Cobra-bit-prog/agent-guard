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
  checkMerchant,
  checkPresence,
  checkReplyShape,
  checkResourceUrl,
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
} from "./copy.ts";
import { handleX402CheckRequest, handleX402ReportRequest } from "./http.ts";
import { orderAddresses, pinLookup, probeEndpoint, type ProbeHop, type ProbeTransport } from "./probe.ts";
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

function hop(body: unknown, status = 402, contentType = "application/json", location?: string): ProbeHop {
  const json = JSON.stringify(body);
  return {
    status,
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        if (key === "content-type") return contentType;
        if (key === "payment-required" && status === 402) return encode(body);
        if (key === "location" && location) return location;
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
    caveat: X402_CHECK_CAVEAT,
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
      contentType: "application/json",
      finalUrl: URL,
      headerRaw: "e30",
      bodyText: "{}",
      payment: payment(),
      paymentSource: "header" as const,
      decodeError: null,
    };
    assert.match(checkReplyShape(probe).detail, /PAYMENT-REQUIRED/);
    assert.equal(checkReplyShape({ ...probe, status: 200, payment: null, paymentSource: null }).status, "fail");
    assert.equal(checkReplyShape({ ...probe, contentType: "text/plain" }).status, "warn");
    assert.equal(checkReplyShape(null).status, "fail");
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
    assert.equal(checkSnippet(null, null).status, "fail");
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

describe("free and paid report", () => {
  it("keeps the free result to the first five checks", async () => {
    const report = await runListingCheck(
      { url: URL, payTo: null },
      "free",
      { lookup: publicLookup, transport: transportFor(payment()) },
    );
    assert.deepEqual(
      report.checks.map((check) => check.id),
      ["v2_fields", "resource_url", "bazaar", "payment_targets", "reply_shape"],
    );
    assert.equal(report.checks.some((check) => "fix" in check), false);
    assert.match(report.caveat, /does not mean Coinbase will list you/);
    assert.doesNotMatch(`${report.caveat} ${X402_CHECK_LINE} ${X402_CHECK_HONESTY}`, BANNED);
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
    assert.equal(report.checks.length, 10);
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
    const freeBody = (await free.json()) as { checks: CheckRow[]; next: { hire: { href: string } } };
    assert.equal(freeBody.checks.length, 2);
    assert.equal(freeBody.next.hire.href, "/hire");

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
