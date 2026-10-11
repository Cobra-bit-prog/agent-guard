import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { handleMcpPost } from "../mcp/handle.ts";
import { MCP_TOOLS } from "../mcp/tools.ts";
import { SOLANA_PAYOUT_ADDRESS } from "../solana-pay.ts";
import type { ListingQuery } from "../directory/listings.ts";
import { fetchPublicHttps, type ProbeHop, type ProbeTransport } from "../x402-check/probe.ts";
import { isBlockedIp, parsePublicHttpsUrl, SsrfError } from "../x402-check/ssrf.ts";
import {
  checkAgentCard,
  checkAgentsJson,
  checkBlocks,
  checkCrawlers,
  checkDescriptions,
  checkDirectory,
  checkLlms,
  checkLlmsLinks,
  checkMcpJson,
  checkMcpReach,
  checkMcpVersion,
  checkRegistry,
  agentPathsFrom,
  checkRobotsPaths,
  checkSitemap,
  checkSkill,
  descriptionProblem,
  versionPinned,
  type FetchedDoc,
  type SiteSnapshot,
} from "./checks.ts";
import {
  AGENT_CHECK_CAVEAT,
  AGENT_CHECK_HIRE_LINE,
  AGENT_CHECK_HONESTY,
  AGENT_CHECK_LINE,
  AGENT_CHECK_PRICE_USD,
  AGENT_CHECK_SKU,
  FREE_CHECK_IDS,
} from "./copy.ts";
import type { DocFetch } from "./crawl.ts";
import { handleAgentCheckRequest, handleAgentReportRequest } from "./http.ts";
import { blockedAgentPaths } from "./robots.ts";
import { runAgentCheck, type AgentReport } from "./run.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ORDERS = readFileSync(join(ROOT, "migrations/0039_agent_check_orders.sql"), "utf8");
const NOW = new Date("2026-10-11T12:00:00.000Z");
const ORIGIN = "https://ready.example";
const BANNED = /guaranteed|\bsafe\b|endors|partner|escrow|\bhold\b|keep 10%|pay only when|openai|anthropic|\bxai\b/i;

function wrap(db: PGlite): ListingQuery {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

function doc(path: string, body = "", status = 200, contentType = "text/plain"): FetchedDoc {
  return { path, status, contentType, body, truncated: false, error: null };
}

function site(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    origin: ORIGIN,
    robots: doc("/robots.txt", "User-agent: *\nAllow: /\n"),
    llms: doc("/llms.txt", "# Ready\n\nhttps://ready.example/skill.md\n"),
    agentsWellKnown: doc(
      "/.well-known/agents.json",
      JSON.stringify({
        site: { name: "Ready", url: ORIGIN, description: "Ready helps an agent start on this site." },
        skills: [{ url: `${ORIGIN}/skill.md`, description: "Read the skill file and follow it." }],
        payments: { note: "Listing on this site is free." },
        mcp: [{ url: `${ORIGIN}/mcp`, type: "streamable-http", version: "2025-06-18", description: "The MCP server lists public tools." }],
      }),
      200,
      "application/json",
    ),
    agentsRoot: doc("/agents.json", "", 404),
    agentCard: doc("/.well-known/agent-card.json", "", 404, "application/json"),
    mcpJson: doc("/.well-known/mcp.json", "", 404, "application/json"),
    skill: doc("/skill.md", "# How an agent starts\n\n1. Read this file.\n2. Call the public https API.\n"),
    sitemap: doc("/sitemap.xml", "", 404, "application/xml"),
    links: [],
    mcp: null,
    directory: { names: [] },
    registry: { listed: false },
    ...overrides,
  };
}

function post(path: string, body: unknown, ip = "203.0.113.20") {
  return new Request(`https://agent-control.net${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

function fullReport(): AgentReport {
  return {
    product: "agent_readiness_check",
    tier: "full",
    input: { url: ORIGIN },
    checks: [
      { id: "robots_paths", title: "robots.txt and the paths you advertise", status: "fail", detail: "blocked", fix: "Allow: /api/v1/jobs" },
      { id: "llms_txt", title: "llms.txt", status: "pass", detail: "ok" },
    ],
    passed: 1,
    failed: 1,
    warned: 0,
    unchecked: 0,
    caveat: AGENT_CHECK_CAVEAT,
    documents: [{ path: "/llms.txt", status: 200 }],
  };
}

describe("fixtures", () => {
  it("fails when robots.txt blocks a path llms.txt names, and the fix is an Allow line", () => {
    const snapshot = site({
      robots: doc("/robots.txt", "User-agent: *\nDisallow: /api/\n"),
      llms: doc("/llms.txt", "Call GET /api/v1/jobs\n"),
    });
    const check = checkRobotsPaths(snapshot);
    assert.equal(check.status, "fail");
    assert.match(check.detail, /\/api\/v1\/jobs/);
    assert.match(check.fix ?? "", /Allow: \/api\/v1\/jobs/);
  });

  it("passes a longer Allow over a broad Disallow", () => {
    const snapshot = site({
      robots: doc("/robots.txt", "User-agent: *\nAllow: /api/v1/jobs\nDisallow: /api/\n"),
      llms: doc("/llms.txt", "GET /api/v1/jobs\n"),
    });
    assert.equal(checkRobotsPaths(snapshot).status, "pass");
  });

  it("checks llms.txt for plain text and a sane size", () => {
    assert.equal(checkLlms(site()).status, "pass");
    assert.equal(checkLlms(site({ llms: doc("/llms.txt", "", 404) })).status, "fail");
    assert.match(checkLlms(site({ llms: doc("/llms.txt", "<!doctype html><html>", 200, "text/html") })).detail, /HTML/);
    const huge = site({ llms: { ...doc("/llms.txt", "x".repeat(80)), truncated: true } });
    assert.match(checkLlms(huge).detail, /64KB/);
    assert.equal(checkLlms(site({ llms: { ...doc("/llms.txt"), error: "The file did not answer.", status: 0 } })).status, "unchecked");
  });

  it("checks a limited set of llms.txt links", () => {
    const missing = checkLlmsLinks(site({ links: [{ url: `${ORIGIN}/skill.md`, status: 404, error: null }] }));
    assert.equal(missing.status, "fail");
    const ok = checkLlmsLinks(site({ links: [{ url: `${ORIGIN}/skill.md`, status: 200, error: null }] }));
    assert.equal(ok.status, "pass");
    assert.match(ok.detail, /up to 5/);
    assert.equal(checkLlmsLinks(site({ links: [] })).status, "warn");
  });

  it("requires agents.json with site fields", () => {
    assert.equal(checkAgentsJson(site()).status, "pass");
    const missing = checkAgentsJson(site({
      agentsWellKnown: doc("/.well-known/agents.json", "", 404),
      agentsRoot: doc("/agents.json", "", 404),
    }));
    assert.equal(missing.status, "fail");
    assert.match(missing.fix ?? "", /"description": "One sentence about what an agent can do here\."/);
    const invalid = checkAgentsJson(site({ agentsWellKnown: doc("/.well-known/agents.json", "{", 200, "application/json") }));
    assert.match(invalid.detail, /not JSON/);
    const partial = JSON.stringify({ site: { name: "Ready" } });
    assert.match(checkAgentsJson(site({ agentsWellKnown: doc("/.well-known/agents.json", partial, 200, "application/json") })).detail, /site\.url/);
  });

  it("flags a description that is longer than one sentence", () => {
    assert.equal(descriptionProblem("One clear sentence about the site."), null);
    const sentence = descriptionProblem("First sentence. Second sentence.");
    assert.ok(sentence);
    assert.match(sentence, /one sentence/);
    const long = "This description keeps going and going until it is far too long for an agent to read as a single clear sentence about the product, the next step, and every extra detail that should have been left out of the file.";
    assert.ok(long.length > 200);
    const json = JSON.stringify({
      site: { name: "Ready", url: ORIGIN, description: long },
    });
    const check = checkDescriptions(site({ agentsWellKnown: doc("/.well-known/agents.json", json, 200, "application/json") }));
    assert.equal(check.status, "fail");
    assert.match(check.fix ?? "", /This description keeps going/);
    assert.equal(checkDescriptions(site()).status, "pass");
  });

  it("requires skills and payments blocks when the site advertises them", () => {
    const noSkills = JSON.stringify({
      site: { name: "Ready", url: ORIGIN, description: "Ready helps an agent start on this site." },
    });
    const snapshot = site({
      agentsWellKnown: doc("/.well-known/agents.json", noSkills, 200, "application/json"),
      llms: doc("/llms.txt", "Featured is $19 USDC.\nhttps://ready.example/skill.md\n"),
    });
    const check = checkBlocks(snapshot);
    assert.equal(check.status, "fail");
    assert.match(check.detail, /skills/);
    assert.match(check.detail, /payments/);
    assert.equal(checkBlocks(site()).status, "pass");
  });

  it("requires a pinned MCP version and ignores latest", () => {
    assert.equal(versionPinned("2025-06-18"), true);
    assert.equal(versionPinned("1.0.0"), true);
    assert.equal(versionPinned("latest"), false);
    assert.equal(versionPinned("^1.0.0"), false);
    assert.equal(versionPinned(null), false);
    const loose = JSON.stringify({
      site: { name: "Ready", url: ORIGIN, description: "Ready helps an agent start on this site." },
      mcp: [{ url: `${ORIGIN}/mcp`, version: "latest", description: "The MCP server lists public tools." }],
    });
    const check = checkMcpVersion(site({
      agentsWellKnown: doc("/.well-known/agents.json", loose, 200, "application/json"),
    }));
    assert.equal(check.status, "fail");
    assert.match(check.fix ?? "", /2025-06-18/);
    assert.equal(checkMcpVersion(site({
      agentsWellKnown: doc("/.well-known/agents.json", JSON.stringify({ site: { name: "Ready", url: ORIGIN, description: "Ready helps an agent start." } }), 200, "application/json"),
      agentCard: doc("/.well-known/agent-card.json", "", 404),
      mcpJson: doc("/.well-known/mcp.json", "", 404),
    })).status, "pass");
  });

  it("checks the agent card and the MCP manifest", () => {
    assert.equal(checkAgentCard(site()).status, "fail");
    const card = JSON.stringify({
      name: "Ready",
      description: "Ready helps an agent start on this site.",
      url: `${ORIGIN}/mcp`,
      version: "1.0.0",
      capabilities: { streaming: false },
      skills: [{ id: "start", name: "Start", description: "Read the skill file." }],
    });
    assert.equal(checkAgentCard(site({ agentCard: doc("/.well-known/agent-card.json", card, 200, "application/json") })).status, "pass");
    assert.equal(checkMcpJson(site()).status, "fail");
    const manifest = JSON.stringify({ name: "ready", remotes: [{ type: "streamable-http", url: `${ORIGIN}/mcp` }] });
    assert.equal(checkMcpJson(site({ mcpJson: doc("/.well-known/mcp.json", manifest, 200, "application/json") })).status, "pass");
  });

  it("calls initialize and tools/list, and does not call a tool", async () => {
    const bodies: string[] = [];
    const report = await runAgentCheck(ORIGIN, "full", {
      directory: async () => ({ names: [] }),
      registry: async () => ({ listed: false }),
      fetch: (async (url, init): Promise<Awaited<ReturnType<DocFetch>>> => {
        bodies.push(init?.body ?? "");
        if (init?.body?.includes("tools/call")) throw new Error("called a tool");
        if (init?.body?.includes("initialize")) {
          return {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }),
            truncated: false,
            headers: { "mcp-session-id": "11111111-1111-1111-1111-111111111111" },
            error: null,
          };
        }
        if (init?.body?.includes("tools/list")) {
          return {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "ping" }] } }),
            truncated: false,
            headers: {},
            error: null,
          };
        }
        const path = new URL(url).pathname;
        const files: Record<string, { body: string; type: string }> = {
          "/robots.txt": { body: "User-agent: *\nAllow: /\nSitemap: https://ready.example/sitemap.xml\n", type: "text/plain" },
          "/llms.txt": { body: "See https://ready.example/skill.md\n", type: "text/plain" },
          "/.well-known/agents.json": {
            body: JSON.stringify({
              site: { name: "Ready", url: ORIGIN, description: "Ready helps an agent start on this site." },
              skills: [{ url: `${ORIGIN}/skill.md`, description: "Read the skill file and follow it." }],
              mcp: [{ url: `${ORIGIN}/mcp`, type: "streamable-http", version: "2025-06-18", description: "The MCP server lists public tools." }],
            }),
            type: "application/json",
          },
          "/agents.json": { body: "", type: "text/plain" },
          "/skill.md": { body: "# How an agent starts\n\n1. Read this file.\n2. Call the public https API.\n", type: "text/markdown" },
          "/sitemap.xml": { body: "<urlset><url><loc>https://ready.example/</loc></url></urlset>", type: "application/xml" },
          "/.well-known/agent-card.json": { body: "", type: "application/json" },
          "/.well-known/mcp.json": { body: "", type: "application/json" },
        };
        const file = files[path];
        if (!file || !file.body) return { status: 404, contentType: "text/plain", body: "", truncated: false, headers: {}, error: null };
        return { status: 200, contentType: file.type, body: file.body, truncated: false, headers: {}, error: null };
      }) satisfies DocFetch,
    });
    assert.equal(report.tier, "full");
    assert.ok(report.checks.length > FREE_CHECK_IDS.length);
    const reach = report.checks.find((check) => check.id === "mcp_reach");
    assert.equal(reach?.status, "pass");
    assert.match(reach?.detail ?? "", /No tool was called/);
    assert.equal(bodies.some((body) => body.includes("tools/call")), false);
    assert.equal(bodies.filter((body) => body.includes("initialize")).length, 1);
    const free = await runAgentCheck(ORIGIN, "free", {
      fetch: async () => ({ status: 404, contentType: "text/plain", body: "", truncated: false, headers: {}, error: null }),
    });
    assert.deepEqual(free.checks.map((check) => check.id), [...FREE_CHECK_IDS]);
    assert.equal(free.checks.some((check) => "fix" in check), false);
    const fullFix = report.checks.find((check) => check.id === "agent_card");
    assert.ok(fullFix?.fix);
  });

  it("reports crawler rules without judging the policy", () => {
    const snapshot = site({
      robots: doc("/robots.txt", "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n"),
    });
    const check = checkCrawlers(snapshot);
    assert.equal(check.status, "pass");
    assert.match(check.detail, /not a verdict/);
    assert.match(check.detail, /GPTBot/);
    assert.doesNotMatch(check.detail, /should allow|must allow|bad policy/i);
  });

  it("checks sitemap, skill.md, directory, and the registry", () => {
    assert.match(checkSkill(site({ skill: doc("/skill.md", "", 404) })).detail, /skill\.md/);
    assert.equal(checkSkill(site()).status, "pass");
    const sitemap = checkSitemap(site({
      robots: doc("/robots.txt", "User-agent: *\nAllow: /\n"),
      sitemap: doc("/sitemap.xml", "<urlset><url><loc>https://ready.example/</loc></url></urlset>", 200, "application/xml"),
    }));
    assert.equal(sitemap.status, "fail");
    assert.match(sitemap.fix ?? "", /Sitemap: https:\/\/ready\.example\/sitemap\.xml/);
    assert.equal(checkDirectory(site({ directory: null })).status, "unchecked");
    assert.equal(checkDirectory(site({ directory: { names: ["Ready"] } })).status, "pass");
    assert.equal(checkDirectory(site()).status, "warn");
    assert.equal(checkRegistry(site({ registry: null })).status, "unchecked");
    assert.match(checkRegistry(site({ registry: null })).detail, /Could not check/);
    assert.equal(checkRegistry(site({ registry: { listed: true } })).status, "pass");
  });

  it("leaves a site with no agent files failed on the free checks", async () => {
    const report = await runAgentCheck("https://empty.example/start", "free", {
      fetch: async (url) => ({
        status: 404,
        contentType: "text/plain",
        body: "",
        truncated: false,
        headers: {},
        error: null,
      }),
    });
    assert.equal(report.input.url, "https://empty.example");
    assert.equal(report.checks.length, 5);
    assert.equal(report.checks.find((check) => check.id === "llms_txt")?.status, "fail");
    assert.equal(report.checks.find((check) => check.id === "agents_json")?.status, "fail");
    assert.equal(report.checks.find((check) => check.id === "skill_md")?.status, "fail");
    assert.equal(report.checks.every((check) => !("fix" in check)), true);
  });
});

describe("ssrf", () => {
  const blocked = [
    "http://ready.example/",
    "https://user:pass@ready.example/",
    "https://ready.example:8443/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://10.1.2.3/",
    "https://192.168.1.9/",
    "https://169.254.169.254/latest",
    "https://[::1]/",
    "https://metadata.google.internal/",
    "https://foo.local/",
  ];

  for (const raw of blocked) {
    it(`rejects ${raw}`, async () => {
      assert.throws(() => parsePublicHttpsUrl(raw), SsrfError);
      const response = await handleAgentCheckRequest(post("/api/v1/agent-check", { url: raw }), null, {}, NOW);
      assert.equal(response.status, 400);
    });
  }

  it("blocks private, loopback, link-local, and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.8", "192.168.0.1", "169.254.169.254", "::1", "fd00:ec2::254"]) {
      assert.equal(isBlockedIp(ip), true, ip);
    }
  });

  it("does not follow a redirect onto a private address", async () => {
    let calls = 0;
    const transport: ProbeTransport = async (input) => {
      calls += 1;
      assert.equal(input.url.hostname, "ready.example");
      const hop: ProbeHop = {
        status: 302,
        headers: { get: (name) => (name.toLowerCase() === "location" ? "https://169.254.169.254/latest" : null) },
        body: new Uint8Array(),
      };
      return hop;
    };
    await assert.rejects(
      () => fetchPublicHttps(ORIGIN, { lookup: async () => ["1.1.1.1"], transport }),
      /not a public address/,
    );
    assert.equal(calls, 1);
  });

  it("does not fetch a host that resolves to a private address", async () => {
    let calls = 0;
    const transport: ProbeTransport = async () => {
      calls += 1;
      return { status: 200, headers: { get: () => "text/plain" }, body: new Uint8Array() };
    };
    await assert.rejects(
      () => fetchPublicHttps(ORIGIN, { lookup: async () => ["1.1.1.1", "10.0.0.8"], transport }),
      /not a public address/,
    );
    assert.equal(calls, 0);
  });
});

describe("payment", () => {
  it("returns the free JSON check and a locked $19 HTTP 402 invoice", async () => {
    const db = new PGlite();
    await db.exec(ORDERS);
    const sql = wrap(db);
    const free = await handleAgentCheckRequest(
      post("/api/v1/agent-check", { url: `${ORIGIN}/docs`, pay_to: "not-our-wallet", amount_usd: 49 }),
      sql,
      { runFree: async () => ({ ...fullReport(), tier: "free", checks: fullReport().checks.map(({ fix: _fix, ...rest }) => rest) }) },
      NOW,
    );
    assert.equal(free.status, 200);
    const freeBody = (await free.json()) as { checks: Array<{ fix?: string }>; next: { hire: { href: string } }; input: { url: string } };
    assert.equal(freeBody.checks.length, 2);
    assert.equal(freeBody.checks.some((check) => check.fix), false);
    assert.equal(freeBody.next.hire.href, "/hire");
    assert.equal(freeBody.input.url, ORIGIN);

    const started = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { url: ORIGIN, pay_to: "not-our-wallet", amount_usd: 49 }, "203.0.113.21"),
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
      accepts: Array<{ network: string; payTo: string; amount: string }>;
      line: string;
      note: string;
      pay: string;
      status: string;
      target: string;
    };
    assert.equal(invoice.sku, AGENT_CHECK_SKU);
    assert.equal(invoice.price_usd, AGENT_CHECK_PRICE_USD);
    assert.equal(invoice.amount_usd, 19);
    assert.equal(invoice.amount_base_units, "19000000");
    assert.equal(invoice.pay_to, SOLANA_PAYOUT_ADDRESS);
    assert.equal(invoice.base_pay_to, EVM_PAYOUT_ADDRESS);
    assert.equal(invoice.asset, "usdc");
    assert.equal(invoice.accepts[0]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(invoice.accepts[1]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(invoice.accepts[0]?.amount, "19000000");
    assert.notEqual(invoice.pay_to, "not-our-wallet");
    assert.equal(invoice.target, ORIGIN);
    assert.match(`${invoice.line} ${invoice.note} ${invoice.pay}`, /directly in USDC/);
    assert.doesNotMatch(`${invoice.line} ${invoice.note} ${invoice.pay}`, BANNED);
    assert.equal(invoice.line, AGENT_CHECK_LINE);
    assert.equal(invoice.note, AGENT_CHECK_HONESTY);

    const paid = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { invoice_id: invoice.invoice_id }, "203.0.113.21"),
      sql,
      {
        findPayment: async () => ({ kind: "paid", signature: "tx-sol", amountUsdc: 19 }),
        runReport: async () => fullReport(),
      },
      NOW,
    );
    assert.equal(paid.status, 200);
    const paidBody = (await paid.json()) as { status: string; runs_used: number; rechecks_left: number; report: { tier: string; checks: Array<{ fix?: string }> } };
    assert.equal(paidBody.status, "paid");
    assert.equal(paidBody.runs_used, 1);
    assert.equal(paidBody.rechecks_left, 1);
    assert.equal(paidBody.report.tier, "full");
    assert.ok(paidBody.report.checks.some((check) => check.fix));

    const again = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { invoice_id: invoice.invoice_id, recheck: true }, "203.0.113.21"),
      sql,
      { runReport: async () => fullReport() },
      NOW,
    );
    const second = (await again.json()) as { runs_used: number; rechecks_left: number };
    assert.equal(again.status, 200);
    assert.equal(second.runs_used, 2);
    assert.equal(second.rechecks_left, 0);

    const third = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { invoice_id: invoice.invoice_id, recheck: true }, "203.0.113.21"),
      sql,
      { runReport: async () => fullReport() },
      NOW,
    );
    assert.equal(third.status, 402);
    assert.match(((await third.json()) as { error: string }).error, /already used/);
  });

  it("closes the free re-check after 7 days", async () => {
    const db = new PGlite();
    await db.exec(ORDERS);
    const sql = wrap(db);
    const started = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { url: ORIGIN }, "203.0.113.22"),
      sql,
      {},
      NOW,
    );
    const invoice = (await started.json()) as { invoice_id: string };
    const paid = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { invoice_id: invoice.invoice_id }, "203.0.113.22"),
      sql,
      {
        findPayment: async () => ({ kind: "paid", signature: "tx-sol", amountUsdc: 19 }),
        runReport: async () => fullReport(),
      },
      NOW,
    );
    assert.equal(paid.status, 200);
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const closed = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { invoice_id: invoice.invoice_id, recheck: true }, "203.0.113.22"),
      sql,
      { runReport: async () => fullReport() },
      later,
    );
    assert.equal(closed.status, 402);
    assert.match(((await closed.json()) as { error: string }).error, /7 days are over/);
  });

  it("refuses an unrecorded payment instead of asking for USDC", async () => {
    const response = await handleAgentReportRequest(
      post("/api/v1/agent-check/report", { url: ORIGIN }, "203.0.113.23"),
      null,
      {},
      NOW,
    );
    assert.equal(response.status, 402);
    const body = (await response.json()) as { recorded: boolean; error: string; amount_base_units: string };
    assert.equal(body.recorded, false);
    assert.match(body.error, /Do not send USDC/);
    assert.equal(body.amount_base_units, "19000000");
  });
});

describe("discovery", () => {
  it("lists the page, the free tool, and the analytics events", async () => {
    const sitemap = readFileSync(join(ROOT, "public/sitemap.xml"), "utf8");
    const llms = readFileSync(join(ROOT, "public/llms.txt"), "utf8");
    const skill = readFileSync(join(ROOT, "public/skill.md"), "utf8");
    const card = readFileSync(join(ROOT, "public/.well-known/agent-card.json"), "utf8");
    const page = readFileSync(join(ROOT, "src/routes/agent-check.tsx"), "utf8");
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/agent-check<\/loc>/);
    assert.match(llms, /https:\/\/agent-control\.net\/agent-check/);
    assert.match(llms, /agent_readiness_check/);
    assert.match(skill, /agent_readiness_check/);
    assert.match(card, /agent_readiness_check/);
    assert.match(page, /trackAgentCheckRun/);
    assert.match(page, /trackAgentReportStart/);
    assert.equal(AGENT_CHECK_HIRE_LINE, "Hire us, we fix it with you");
    assert.match(page, /AGENT_CHECK_HIRE_LINE/);
    assert.match(page, /\/directory#featured/);
    assert.doesNotMatch(page, BANNED);

    const names = MCP_TOOLS.map((tool) => tool.name);
    assert.equal(names.indexOf("agent_readiness_check"), names.indexOf("x402_listing_check") + 1);

    const origin = "https://agent-control.net";
    const agentsJson = readFileSync(join(ROOT, "public/agents.json"), "utf8");
    const mcpFile = readFileSync(join(ROOT, "public/.well-known/mcp.json"), "utf8");
    const robots = readFileSync(join(ROOT, "public/robots.txt"), "utf8");
    const jsonDoc = (path: string, body: string) => doc(path, body, 200, "application/json");
    const ownSite = site({
      origin,
      robots: doc("/robots.txt", robots),
      llms: doc("/llms.txt", llms),
      skill: doc("/skill.md", skill),
      agentsWellKnown: jsonDoc("/.well-known/agents.json", agentsJson),
      agentsRoot: jsonDoc("/agents.json", agentsJson),
      agentCard: jsonDoc("/.well-known/agent-card.json", card),
      mcpJson: jsonDoc("/.well-known/mcp.json", mcpFile),
    });
    const robotsCheck = checkRobotsPaths(ownSite);
    assert.equal(robotsCheck.status, "pass", robotsCheck.detail);
    const descriptions = checkDescriptions(ownSite);
    assert.equal(descriptions.status, "pass", descriptions.detail);
    const named = agentPathsFrom(origin, [llms, skill, agentsJson, agentsJson, card, mcpFile]);
    assert.equal(named.includes("/api/v1/agents/listings/featured"), false);
    assert.deepEqual(blockedAgentPaths(robots, named), []);
    const advertised = new Set<string>();
    const host = new URL(origin).host;
    for (const text of [llms, skill, agentsJson, card, mcpFile]) {
      for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
        try {
          const url = new URL(match[0].replace(/[.,);]+$/, ""));
          if (url.host === host && url.pathname !== "/") advertised.add(url.pathname);
        } catch {
          /* skip a bad url */
        }
      }
      for (const match of text.matchAll(/(?:GET|POST|HEAD)\s+(\/[A-Za-z0-9._~%+\-/]*)/g)) {
        const path = match[1]?.replace(/[.,);]+$/, "");
        if (path && path !== "/") advertised.add(path);
      }
    }
    assert.deepEqual(blockedAgentPaths(robots, [...advertised]), ["/api/v1/agents/listings/featured"]);
    const res = await handleMcpPost(
      new Request("https://agent-control.net/api/v1/mcp", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
      }),
      { callTool: async () => ({ ok: false, status: 400, code: -32601, message: "Unknown tool." }) },
    );
    const rpc = (await res.json()) as { result: { instructions: string } };
    assert.match(rpc.result.instructions, /agent_readiness_check/);
    assert.match(rpc.result.instructions, /does not mean a crawler or an agent will use the site/);
  });
});
