import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOLANA_PAYOUT_ADDRESS, USDC_MINT } from "../solana-pay.ts";
import { EVM_PAYOUT_ADDRESS } from "../evm-pay.ts";
import { BASE_USDC } from "./accepts.ts";
import {
  AGENT_CARD_PATH,
  AGENT_JSON_PATH,
  MCP_WELL_KNOWN_PATH,
  METER_DISCOVERY_LEAD,
  OPENAPI_METER_PATH,
  PUBLIC_ORIGIN,
  X402_WELL_KNOWN_PATH,
  agentCard,
  handleMeterWellKnown,
  mcpWellKnown,
  meterLookAccepts,
  meterOpenApi,
  x402WellKnown,
} from "./discovery.ts";
import { METER_BAZAAR_DESCRIPTION } from "./bazaar.ts";

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
    assert.equal(accepts.length, 4);
    assert.equal(accepts[0]?.scheme, "exact");
    assert.equal(accepts[0]?.network, "solana");
    assert.equal(accepts[0]?.maxAmountRequired, "200000");
    assert.equal(accepts[0]?.amount, "200000");
    assert.equal(accepts[0]?.payTo, SOLANA_PAYOUT_ADDRESS);
    assert.equal(accepts[0]?.payTo, PAY_TO);
    assert.equal(accepts[0]?.asset, USDC_MINT);
    assert.equal(accepts[0]?.extra.sku, "looks_20");
    assert.equal(accepts[0]?.extra.price_usd, 0.2);
    assert.match(String(accepts[0]?.extra.question ?? ""), /Can I pay this address\?/);
    assert.equal(accepts[1]?.scheme, "exact");
    assert.equal(accepts[1]?.network, "base");
    assert.equal(accepts[1]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(accepts[1]?.payTo, "0xc5df91Fd7D9578A63efe9B0ee96Bacc5e7742E98");
    assert.equal(accepts[1]?.asset, BASE_USDC);
    assert.equal(accepts[1]?.amount, "200000");
    assert.equal(accepts[1]?.extra.sku, "looks_20");
    assert.equal(accepts[1]?.extra.name, "USD Coin");
    assert.equal(accepts[1]?.extra.version, "2");
    assert.equal(accepts[1]?.extra.assetTransferMethod, "eip3009");
    assert.equal(accepts[1]?.extra.caip2, "eip155:8453");
    assert.equal(accepts[2]?.extra.sku, "look");
    assert.equal(accepts[2]?.amount, "100000");
    assert.equal(accepts[3]?.extra.sku, "look");
    assert.equal(accepts[3]?.amount, "100000");
    assert.equal(accepts[3]?.network, "base");
  });

  it("describes Agent Meter look $0.10 Solana USDC for crawlers", () => {
    const body = x402WellKnown();
    assert.equal(body.x402Version, 2);
    assert.equal(body.kind, "resource-server");
    assert.equal(body.name, "Agent Meter");
    assert.equal(
      METER_DISCOVERY_LEAD,
      "Can I pay this address? First 5 free. After free-5, buy looks_20 pack ($0.20) → X-Agent-Pass; look $0.10 is optional one-shot. No inbox.",
    );
    assert.match(body.description, /Can I pay this address\?/);
    assert.match(body.description, /First 5 free/);
    assert.match(body.description, /looks_20 pack \(\$0\.20\)/);
    assert.match(body.description, /look \$0\.10 is optional one-shot/);
    assert.match(body.description, /No inbox/);
    assert.match(body.description, /Human App is separate/);
    assert.match(body.description, /Base USDC \(EIP-3009 exact\)/);
    assert.match(body.description, /Solana USDC/);
    assert.equal(body.accepts[0]?.payTo, PAY_TO);
    assert.equal(body.accepts[0]?.amount, "200000");
    assert.equal(body.accepts[0]?.extra.sku, "looks_20");
    assert.equal(body.accepts[1]?.payTo, EVM_PAYOUT_ADDRESS);
    assert.equal(body.accepts[1]?.amount, "200000");
    assert.equal(body.accepts.length, 4);
    assert.equal(body.resources[0]?.url, `${PUBLIC_ORIGIN}/api/v1/meter/pass`);
    assert.equal(body.resources[0]?.method, "POST");
    assert.equal(body.resources[0]?.description, METER_BAZAAR_DESCRIPTION);
    assert.ok((body.resources[0]?.description ?? "").length <= 500);
    assert.equal(body.resources[0]?.extensions?.bazaar?.info?.input?.method, "POST");
    assert.equal(body.resources[0]?.extensions?.bazaar?.info?.input?.bodyType, "json");
    assert.equal(body.resources[1]?.url, `${PUBLIC_ORIGIN}/api/v1/meter/scan`);
    assert.equal(body.resources[1]?.extensions?.bazaar?.info?.input?.method, "POST");
    assert.equal(body.docs, `${PUBLIC_ORIGIN}/docs#agent-meter`);
    assert.doesNotMatch(JSON.stringify(body), /facilitator/i);
    assert.doesNotMatch(JSON.stringify(body), /Hostile/);
    assert.notEqual(body.accepts[0]?.payTo, "HostileWalletDoNotPay11111111111111111111");
  });

  it("serves GET /.well-known/x402, agent-card.json, and mcp.json", async () => {
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

    const mcp = get(MCP_WELL_KNOWN_PATH);
    assert.ok(mcp);
    assert.equal(mcp.status, 200);
    assert.match(mcp.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(mcp.headers.get("access-control-allow-origin"), "*");
    const mcpBody = (await mcp.json()) as ReturnType<typeof mcpWellKnown>;
    assert.deepEqual(mcpBody, mcpWellKnown());
    assert.equal(mcpBody.mcp, `${PUBLIC_ORIGIN}/api/v1/mcp`);
    assert.equal(mcpBody.transport, "streamable-http");
    assert.equal(mcpBody.remotes[0]?.type, "streamable-http");
    assert.equal(mcpBody.remotes[0]?.url, `${PUBLIC_ORIGIN}/api/v1/mcp`);
    assert.match(mcpBody.description, /Can I pay this address\?/);
    assert.match(mcpBody.description, /First 5 free/);
    assert.match(mcpBody.description, /looks_20 pack \(\$0\.20\)/);
    assert.match(mcpBody.description, /look \$0\.10 is optional one-shot/);
    assert.match(mcpBody.description, /No inbox/);
    assert.match(mcpBody.description, /Human App is separate \(\$29\)/);
    assert.match(mcpBody.products.meter, /Bearer empty/);
    assert.match(mcpBody.products.meter, /no Authorization/);
    assert.match(mcpBody.description, /no Authorization/);
    assert.match(mcpBody.products.human_app, /Humans pay \$29/);
    assert.doesNotMatch(JSON.stringify(mcpBody), /pass_1h/);

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
    const mcpFile = JSON.parse(read("public/.well-known/mcp.json")) as ReturnType<typeof mcpWellKnown>;
    const openapiFile = JSON.parse(read("public/openapi-meter.json")) as ReturnType<typeof meterOpenApi>;
    assert.deepEqual(x402File, x402WellKnown());
    assert.deepEqual(cardFile, agentCard());
    assert.deepEqual(mcpFile, mcpWellKnown());
    assert.deepEqual(openapiFile, meterOpenApi());
    assert.equal(x402File.accepts[0]?.payTo, PAY_TO);
    assert.equal(x402File.accepts[0]?.amount, "200000");
    assert.equal(x402File.accepts[0]?.extra.sku, "looks_20");
    assert.equal(x402WellKnown().accepts[0]?.amount, "200000");
    assert.match(openapiFile.info.description, /No inbox/);
    assert.equal(OPENAPI_METER_PATH, "/openapi-meter.json");
    assert.equal(MCP_WELL_KNOWN_PATH, "/.well-known/mcp.json");
  });
});

describe("Meter-first registry-facing blurbs", () => {
  it("leads MCP / server.json / agents.json with the look door, not Bearer-only", () => {
    const agents = read("public/agents.json");
    const agentsTxt = read("public/agents.txt");
    const server = read("server.json");
    const mcpCard = read("public/.well-known/mcp.json");
    const tools = read("src/lib/mcp/tools.ts");
    const handle = read("src/lib/mcp/handle.ts");
    const plugin = read(".cursor-plugin/plugin.json");
    const connectors = read("CONNECTORS.md");

    for (const blob of [agents, agentsTxt, server, mcpCard, plugin, connectors]) {
      const look = blob.search(/Can I pay this address\?/);
      const bearer = blob.search(/Bearer agent API key|Agents use a Bearer API key/);
      assert.ok(look >= 0, "missing look question");
      assert.match(blob, /First 5 free/);
      assert.match(blob, /\$0\.10/);
      assert.match(blob, /looks_20 pack \(\$0\.20\)/);
      assert.match(blob, /optional one-shot/);
      assert.match(blob, /No inbox/i);
      if (bearer >= 0) {
        assert.ok(look < bearer, "Meter look must lead Bearer");
      }
    }

    assert.match(tools, /METER_AGENT_LEAD/);
    assert.match(handle, /METER_AGENT_LEAD/);
    const instructionsLead = handle.indexOf("METER_AGENT_LEAD");
    const humanLead = handle.indexOf("Human App (separate):");
    assert.ok(instructionsLead >= 0 && humanLead > instructionsLead);
  });

  it("exposes well-known x402 and mcp.json on robots, sitemap, vercel, and llms", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const vercel = read("vercel.json");
    const vite = read("vite.config.ts");
    const llms = read("public/llms.txt");

    assert.match(robots, /Allow: \/\.well-known\/x402/);
    assert.match(robots, /Allow: \/\.well-known\/agent-card\.json/);
    assert.match(robots, /Allow: \/\.well-known\/mcp\.json/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/x402<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/agent-card\.json<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/\.well-known\/mcp\.json<\/loc>/);
    assert.match(vercel, /"source": "\/\.well-known\/x402"/);
    assert.match(vercel, /"source": "\/\.well-known\/agent-card\.json"/);
    assert.match(vercel, /"source": "\/\.well-known\/mcp\.json"/);
    assert.match(vite, /pathOnly === "\/\.well-known\/mcp\.json"/);
    assert.match(llms, /\/\.well-known\/x402/);
    assert.match(llms, /\/\.well-known\/mcp\.json/);
    assert.match(llms, /openapi-meter\.json/);
  });
});
