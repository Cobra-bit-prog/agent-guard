import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETPLACE_AGENT_LEAD } from "./marketplace-lead.ts";
import { BASE_CAIP2, SOLANA_CAIP2 } from "./meter/accepts.ts";
import { DEFAULT_PROTOCOL_VERSION } from "./mcp/transport.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** RFC 9309: longest matching Allow/Disallow path wins. A tie allows. */
function robotsAllows(robots: string, path: string): boolean {
  let bestLength = -1;
  let allowed = true;
  for (const raw of robots.split("\n")) {
    const line = raw.trim();
    const allow = line.startsWith("Allow:");
    const disallow = line.startsWith("Disallow:");
    if (!allow && !disallow) continue;
    const rule = line.slice(line.indexOf(":") + 1).trim();
    if (!rule || !path.startsWith(rule) || rule.length < bestLength) continue;
    if (rule.length === bestLength && !allow) continue;
    bestLength = rule.length;
    allowed = allow;
  }
  return allowed;
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
    payments: {
      x402: { chains: string[]; description: string };
      required?: boolean;
      pricing?: { amount: string | number };
    };
    skills: Array<{ url: string; description: string }>;
    mcp: Array<{ url: string; type: string; version?: string; description: string }>;
  };
  const blob = `${txt}\n${jsonRaw}`;

  it("leads with the free job board and free agent list", () => {
    const look = txt.indexOf("Can I pay this address?");
    assert.ok(look > 0);
    assert.ok(txt.indexOf(MARKETPLACE_AGENT_LEAD) >= 0);
    assert.ok(txt.indexOf(MARKETPLACE_AGENT_LEAD) < look);
    assert.ok(txt.indexOf("https://agent-control.net/exchange") < look);
    assert.ok(txt.indexOf("https://agent-control.net/directory") < look);
    assert.ok(txt.indexOf("GET and POST https://agent-control.net/api/v1/exchange/jobs") < look);
    assert.ok(txt.indexOf("GET and POST https://agent-control.net/api/v1/agents/listings") < look);
    assert.equal(
      json.site.description,
      "Listing on the job board and agent directory is free, and Featured is $19 USDC for 7 days on Base or Solana.",
    );
    assert.equal(json.site.description.split(".").filter((part) => part.trim()).length, 1);
    assert.match(json.skills[0]?.description ?? "", /GET and POST https:\/\/agent-control\.net\/api\/v1\/agents\/listings/);
    assert.match(json.skills[0]?.description ?? "", /list_your_agent, browse_agents, list_open_jobs, post_job/);
    assert.doesNotMatch(
      MARKETPLACE_AGENT_LEAD,
      /refund|escrow|keep 10%|pay only when|when the job is done|hold funds/i,
    );
    assert.doesNotMatch(json.site.description, /escrow|keep 10%|hold funds|endorse/i);
    assert.equal(read("public/.well-known/agents.json"), jsonRaw);
  });

  it("declares x402 payments, a skill file, and a pinned MCP revision", () => {
    assert.deepEqual(json.payments.x402.chains, [BASE_CAIP2, SOLANA_CAIP2]);
    assert.match(json.payments.x402.description, /Listing is free/);
    assert.match(json.payments.x402.description, /\$19 USDC for 7 days on Base or Solana/);
    assert.equal(json.payments.required, undefined);
    assert.equal(json.payments.pricing, undefined);
    assert.equal(json.skills.length, 1);
    assert.equal(json.skills[0]?.url, "https://agent-control.net/skill.md");
    assert.match(json.skills[0]?.description ?? "", /https:\/\/agent-control\.net\/list-agent/);
    assert.equal(json.mcp[0]?.version, DEFAULT_PROTOCOL_VERSION);
    assert.equal(json.mcp[0]?.version, "2025-06-18");
    const marketplace = `${json.site.description}\n${json.payments.x402.description}\n${json.skills[0]?.description ?? ""}`;
    assert.doesNotMatch(marketplace, /escrow|keep 10%|hold funds|endorse|officially support/i);
  });

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
    assert.match(blob, /Can I pay this address\?/);
    assert.match(blob, /Buy looks_20 pack \(\$0\.20\) or look \$0\.10/);
    assert.match(blob, /Stamp ticket \$0\.05/);
    assert.doesNotMatch(blob, /First 5 free/);
    assert.doesNotMatch(blob, /free-5/);
    assert.match(blob, /looks_20 pack \(\$0\.20\)/);
    assert.match(blob, /look \$0\.10 is optional one-shot/);
    assert.match(blob, /looks_20/);
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
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/agents\.json<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/llms\.txt<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/exchange<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/directory<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/privacy<\/loc>/);
    assert.ok(
      sitemap.indexOf("<loc>https://agent-control.net/exchange</loc>") <
        sitemap.indexOf("<loc>https://agent-control.net/login</loc>"),
    );
    assert.ok(
      sitemap.indexOf("<loc>https://agent-control.net/directory</loc>") <
        sitemap.indexOf("<loc>https://agent-control.net/login</loc>"),
    );
    assert.doesNotMatch(sitemap, /<loc>https:\/\/agent-control\.net\/meter<\/loc>/);
    assert.doesNotMatch(sitemap, /<loc>https:\/\/agent-control\.net\/live<\/loc>/);

    assert.match(robots, /Allow: \/exchange/);
    assert.match(robots, /Allow: \/directory/);
    assert.match(robots, /Allow: \/\.well-known\/agents\.json/);
    assert.equal(robotsAllows(robots, "/api/v1/exchange/jobs"), true);
    assert.equal(robotsAllows(robots, "/api/v1/agents/listings"), true);
    assert.equal(robotsAllows(robots, "/api/v1/mcp"), true);
    assert.equal(robotsAllows(robots, "/api/v1/agents/listings/featured"), false);
    assert.equal(robotsAllows(robots, "/api/v1/meter/pricing"), false);
    assert.equal(robotsAllows(robots, "/api/v1/meter/pass"), false);
    assert.equal(robotsAllows(robots, "/api/v1/billing/checkout"), false);
    assert.equal(robotsAllows(robots, "/api/v1/check"), false);
    assert.equal(robotsAllows(robots, "/api/v1/check_action"), false);
    assert.equal(robotsAllows(robots, "/api/v1/internal/stats"), false);
    assert.equal(robotsAllows(robots, "/api/v1/storefront/pricing"), false);
    assert.equal(robotsAllows(robots, "/api/auth/callback"), false);
    assert.equal(robotsAllows(robots, "/api/v1/hire"), false);
    assert.equal(robotsAllows(robots, "/api/v1/audit/pricing"), false);
    assert.equal(robotsAllows(robots, "/api/v1/approvals/abc"), false);
    assert.equal(robotsAllows(robots, "/api/v1/gate/demo"), false);
    assert.equal(robotsAllows(robots, "/exchange"), true);

    assert.match(vercel, /"source": "\/agents\.txt"/);
    assert.match(vercel, /"source": "\/agents\.json"/);
    assert.match(vercel, /"source": "\/\.well-known\/agents\.json"/);
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
    assert.match(readme, /Can I pay this address\?/);
    assert.match(readme, /Buy looks_20 pack \(\$0\.20\) or look \$0\.10/);
    assert.match(readme, /Stamp ticket \$0\.05/);
    assert.doesNotMatch(readme, /First 5 free/);
    assert.doesNotMatch(readme, /free-5/);
    assert.match(readme, /looks_20 pack \(\$0\.20\)/);
    assert.match(readme, /look \$0\.10 is optional one-shot/);
    assert.match(readme, /looks_20/);
    assert.match(readme, /No inbox/);
    assert.match(readme, /X-Agent-Pass/);
    assert.match(readme, /docs#agent-meter/);
    assert.match(readme, /Do not (?:reuse|use) these .* for Agent Meter|not these adapters/i);
    assert.match(readme, /buyMeterPass/);
    assert.match(readme, /buyMeterPassBase/);
    assert.match(readme, /payMeterPass/);
    assert.match(readme, /meter-pay\.ts/);
    assert.doesNotMatch(readme, /poll_url/);
    assert.doesNotMatch(readme, /must_abort/);
    assert.doesNotMatch(readme, /\bHOLD\b/);
    assert.doesNotMatch(readme, /\bHelius\b/);
    assert.doesNotMatch(readme, /cheaper/i);
    assert.doesNotMatch(readme, /https:\/\/agent-control\.net\/meter(?:["'\s]|$)/);
  });
});
