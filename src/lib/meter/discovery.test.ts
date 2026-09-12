import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import {
  AGENT_CARD_PATH,
  AGENT_JSON_PATH,
  METER_DISCOVERY_LEAD,
  OPENAPI_METER_PATH,
  PUBLIC_ORIGIN,
  X402_WELL_KNOWN_PATH,
  agentCard,
  handleMeterWellKnown,
  meterLookAccepts,
  meterOpenApi,
  x402WellKnown,
} from "./discovery.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PAY_TO = "49QioAKPzo1Vij2jxdMqSR72cCZbqz2vAQSzrtt1S3nR";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function get(path: string, method = "GET") {
  return handleMeterWellKnown(new Request(`${PUBLIC_ORIGIN}${path}`, { method }));
}

describe("Agent Meter well-known discovery", () => {
  it("locks the look door accepts on the payout wallet", () => {
    const accepts = meterLookAccepts();
    assert.equal(accepts.length, 1);
    assert.equal(accepts[0]?.scheme, "exact");
    assert.equal(accepts[0]?.network, "solana");
    assert.equal(accepts[0]?.maxAmountRequired, "20000");
    assert.equal(accepts[0]?.amount, "20000");
    assert.equal(accepts[0]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(accepts[0]?.payTo, PAY_TO);
    assert.equal(accepts[0]?.asset, USDC_MINT);
    assert.equal(accepts[0]?.extra.sku, "look");
    assert.equal(accepts[0]?.extra.price_usd, 0.02);
    assert.match(accepts[0]?.extra.question ?? "", /Can I pay this address\?/);
  });

  it("describes Agent Meter look $0.02 Solana USDC for crawlers", () => {
    const body = x402WellKnown();
    assert.equal(body.x402Version, 2);
    assert.equal(body.kind, "resource-server");
    assert.equal(body.name, "Agent Meter");
    assert.equal(METER_DISCOVERY_LEAD, "Can I pay this address? First 5 free. Then $0.02. No inbox.");
    assert.match(body.description, /Can I pay this address\?/);
    assert.match(body.description, /First 5 free\. Then \$0\.02/);
    assert.match(body.description, /No inbox/);
    assert.match(body.description, /Human App is separate/);
    assert.equal(body.accepts[0]?.payTo, PAY_TO);
    assert.equal(body.resources[0]?.url, `${PUBLIC_ORIGIN}/api/v1/meter/pass`);
    assert.equal(body.resources[0]?.method, "POST");
    assert.match(body.resources[0]?.description ?? "", /402 look \$0\.02/);
    assert.equal(body.docs, `${PUBLIC_ORIGIN}/docs#agent-meter`);
    assert.doesNotMatch(JSON.stringify(body), /facilitator/i);
    assert.doesNotMatch(JSON.stringify(body), /Hostile/);
    assert.notEqual(body.accepts[0]?.payTo, "HostileWalletDoNotPay11111111111111111111");
  });

  it("serves GET /.well-known/x402 and agent-card.json", async () => {
    const x402 = get(X402_WELL_KNOWN_PATH);
    assert.ok(x402);
    assert.equal(x402.status, 200);
    assert.match(x402.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(x402.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await x402.json(), x402WellKnown());

    const card = get(AGENT_CARD_PATH);
    assert.ok(card);
    assert.equal(card.status, 200);
    const cardBody = (await card.json()) as { skills: { id: string }[] };
    assert.equal(cardBody.skills[0]?.id, "meter-look");
    assert.match(JSON.stringify(cardBody), /Can I pay this address\?/);
    assert.match(JSON.stringify(cardBody), /Human App is separate|Human App \(separate\)/);

    const alias = get(AGENT_JSON_PATH);
    assert.ok(alias);
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get("location"), AGENT_CARD_PATH);

    const options = get(X402_WELL_KNOWN_PATH, "OPTIONS");
    assert.ok(options);
    assert.equal(options.status, 204);

    const post = get(X402_WELL_KNOWN_PATH, "POST");
    assert.ok(post);
    assert.equal(post.status, 405);

    assert.equal(handleMeterWellKnown(new Request(`${PUBLIC_ORIGIN}/.well-known/oauth-authorization-server`)), null);
  });

  it("keeps public crawler files in sync with the handler", () => {
    const x402File = JSON.parse(read("public/.well-known/x402")) as ReturnType<typeof x402WellKnown>;
    const cardFile = JSON.parse(read("public/.well-known/agent-card.json")) as ReturnType<typeof agentCard>;
    const openapiFile = JSON.parse(read("public/openapi-meter.json")) as ReturnType<typeof meterOpenApi>;
    assert.deepEqual(x402File, x402WellKnown());
    assert.deepEqual(cardFile, agentCard());
    assert.deepEqual(openapiFile, meterOpenApi());
    assert.equal(x402File.accepts[0]?.payTo, PAY_TO);
    assert.match(openapiFile.info.description, /No inbox/);
    assert.equal(OPENAPI_METER_PATH, "/openapi-meter.json");
  });
});

describe("Meter-first registry-facing blurbs", () => {
  it("leads MCP / server.json / agents.json with the look door, not Bearer-only", () => {
    const agents = read("public/agents.json");
    const agentsTxt = read("public/agents.txt");
    const server = read("server.json");
    const tools = read("src/lib/mcp/tools.ts");
    const handle = read("src/lib/mcp/handle.ts");
    const plugin = read(".cursor-plugin/plugin.json");
    const connectors = read("CONNECTORS.md");

    for (const blob of [agents, agentsTxt, server, plugin, connectors]) {
      const look = blob.search(/Can I pay this address\?/);
      const bearer = blob.search(/Bearer agent API key|Agents use a Bearer API key/);
      assert.ok(look >= 0, "missing look question");
      assert.match(blob, /First 5 free/);
      assert.match(blob, /\$0\.02/);
      assert.match(blob, /No inbox/i);
      if (bearer >= 0) {
        assert.ok(look < bearer, "Meter look must lead Bearer");
      }
    }

    assert.match(tools, /Can I pay this address\? First 5 free\. Then \$0\.02/);
    assert.match(handle, /Can I pay this address\? First 5 free\. Then \$0\.02\. No inbox\./);
    const instructionsLead = handle.indexOf("Can I pay this address?");
    const humanLead = handle.indexOf("Human App (separate):");
    assert.ok(instructionsLead >= 0 && humanLead > instructionsLead);
  });

  it("exposes well-known x402 on robots, sitemap, vercel, and llms", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const vercel = read("vercel.json");
    const llms = read("public/llms.txt");

    assert.match(robots, /Allow: \/\.well-known\/x402/);
    assert.match(robots, /Allow: \/\.well-known\/agent-card\.json/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/x402<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/agent-card\.json<\/loc>/);
    assert.match(vercel, /"source": "\/\.well-known\/x402"/);
    assert.match(vercel, /"source": "\/\.well-known\/agent-card\.json"/);
    assert.match(llms, /\/\.well-known\/x402/);
    assert.match(llms, /openapi-meter\.json/);
  });
});
