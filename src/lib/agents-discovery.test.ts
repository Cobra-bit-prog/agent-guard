import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const BANNED = [
  /poll_url/,
  /must_abort/,
  /\bHOLD\b/,
  /\bHelius\b/,
  /cheaper/i,
  /https:\/\/agent-control\.net\/meter(?:["'\s]|$)/,
  /https:\/\/agent-control\.net\/live(?:["'\s]|$)/,
];

describe("agents.txt Layer 4 discovery", () => {
  const txt = read("public/agents.txt");
  const jsonRaw = read("public/agents.json");
  const json = JSON.parse(jsonRaw) as {
    $schema: string;
    version: string;
    standard: string;
    site: { name: string; url: string; description: string };
    mcp: Array<{ url: string; type: string; description: string }>;
  };
  const blob = `${txt}\n${jsonRaw}`;

  it("is Layer 4 agents-txt with MCP, Meter pricing, and llms.txt", () => {
    assert.match(txt, /^# agents\.txt\n/);
    assert.match(txt, /# Standard: https:\/\/agents-txt\.com/);
    assert.match(txt, /# JSON: https:\/\/agent-control\.net\/agents\.json/);
    assert.match(txt, /^MCP: https:\/\/agent-control\.net\/api\/v1\/mcp$/m);
    assert.match(txt, /https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/);
    assert.match(txt, /https:\/\/agent-control\.net\/llms\.txt/);
    assert.match(txt, /docs#agent-meter/);

    assert.equal(json.$schema, "https://agents-txt.com/schema/agents-json/v1.0.json");
    assert.equal(json.version, "1.0");
    assert.equal(json.standard, "https://agents-txt.com");
    assert.equal(json.site.name, "Agent Control");
    assert.equal(json.site.url, "https://agent-control.net");
    assert.equal(json.mcp.length, 1);
    assert.equal(json.mcp[0]?.url, "https://agent-control.net/api/v1/mcp");
    assert.equal(json.mcp[0]?.type, "streamable-http");
    assert.match(json.site.description, /https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/);
    assert.match(json.site.description, /https:\/\/agent-control\.net\/llms\.txt/);
    assert.match(
      json.mcp[0]?.description ?? "",
      /https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/,
    );
    assert.match(json.mcp[0]?.description ?? "", /https:\/\/agent-control\.net\/llms\.txt/);
  });

  it("keeps Human App vs Agent Meter split and Meter lock copy", () => {
    assert.match(blob, /Human App/);
    assert.match(blob, /Agent Meter/);
    assert.match(blob, /two products/i);
    assert.match(blob, /Agents pay themselves|agents pay themselves/);
    assert.match(blob, /\$0\.25 pass/);
    assert.match(blob, /scan and preflight/i);
    assert.match(blob, /No inbox/);
    assert.match(blob, /No email/);
    assert.match(blob, /no API key/);
    assert.match(blob, /no Approval Inbox/);
    assert.match(blob, /They ask before they pay/);
    assert.match(blob, /You keep the keys/);
    assert.match(blob, /X-Agent-Pass|pass token/);
    assert.match(json.mcp[0]?.description ?? "", /check_transfer/);
    assert.match(json.mcp[0]?.description ?? "", /meter_scan/);
    assert.match(json.mcp[0]?.description ?? "", /meter_preflight/);
  });

  it("bans hold jargon, Helius, cheaper, and /meter pages", () => {
    for (const re of BANNED) {
      assert.doesNotMatch(blob, re);
    }
  });
});

describe("agents discovery crawler surfaces", () => {
  it("robots, sitemap, and vercel headers expose agents.txt/json — not /meter", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const vercel = read("vercel.json");

    assert.match(robots, /Allow: \/agents\.txt/);
    assert.match(robots, /Allow: \/agents\.json/);
    assert.match(robots, /Allow: \/llms\.txt/);
    assert.doesNotMatch(robots, /\/meter/);
    assert.doesNotMatch(robots, /Agents-Txt:/);

    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/agents\.txt<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/agents\.json<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/llms\.txt<\/loc>/);
    assert.doesNotMatch(sitemap, /<loc>https:\/\/agent-control\.net\/meter<\/loc>/);
    assert.doesNotMatch(sitemap, /<loc>https:\/\/agent-control\.net\/live<\/loc>/);

    assert.match(vercel, /"source": "\/agents\.txt"/);
    assert.match(vercel, /"source": "\/agents\.json"/);
    assert.match(vercel, /text\/plain; charset=utf-8/);
    assert.match(vercel, /Access-Control-Allow-Origin/);
  });
});

describe("adapters README Meter note", () => {
  it("points at the Meter curl recipe without rewriting Human App adapters", () => {
    const readme = read("src/adapters/README.md");
    assert.match(readme, /POST \/api\/v1\/check/);
    assert.match(readme, /createAgentKitPolicyProvider/);
    assert.match(readme, /createX402BeforePaymentHook/);
    assert.match(readme, /## Agent Meter/);
    assert.match(readme, /Agents pay themselves/);
    assert.match(readme, /\$0\.25 pass/);
    assert.match(readme, /scan and preflight/i);
    assert.match(readme, /No inbox/);
    assert.match(readme, /X-Agent-Pass/);
    assert.match(readme, /docs#agent-meter/);
    assert.match(readme, /Do not (?:reuse|use) these .* for Agent Meter|not these adapters/i);
    assert.doesNotMatch(readme, /poll_url/);
    assert.doesNotMatch(readme, /must_abort/);
    assert.doesNotMatch(readme, /\bHOLD\b/);
    assert.doesNotMatch(readme, /\bHelius\b/);
    assert.doesNotMatch(readme, /cheaper/i);
    assert.doesNotMatch(readme, /https:\/\/agent-control\.net\/meter(?:["'\s]|$)/);
  });
});
