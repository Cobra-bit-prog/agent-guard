import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METER_CONNECT_BODY,
  METER_DISCOVERY,
  METER_DOCS_HREF,
  METER_DOCS_URL,
  METER_EYEBROW,
  METER_FREE_LOOK_CURL,
  METER_FREE_LOOK_NOTE,
  METER_HEADLINE,
  METER_LEDE,
  METER_LLMS_HREF,
  METER_MCP_TOOLS,
  METER_MERCHANT_STAMP,
  METER_PACKS,
  METER_PACKS_FIRST,
  METER_PAY_SNIPPET,
  METER_PREFLIGHT_CURL,
  METER_PRICING_CURL,
  METER_PRICING_PATH,
  METER_QUESTION,
  METER_RECIPE,
  METER_RISKS,
  METER_SCAN_CURL,
  METER_SEPARATE,
  METER_STEPS,
  METER_TICKET,
  GATE_DEMO_ALLOW_CURL,
  GATE_DEMO_BLOCKED_CURL,
  GATE_DEMO_PATH,
  GATE_DEMO_URL,
  STAMP_BUY_CURL,
  STAMP_ID_HEADER,
  STAMP_DOCS_HREF,
  STAMP_PATH,
  STAMP_RECIPE,
  STAMP_SELLER_BODY,
  STAMP_SELLER_EYEBROW,
  STAMP_SELLER_HEADLINE,
  STAMP_SELLER_LEDE,
  STAMP_SELLER_STEPS,
  STAMP_SELLER_VERIFY,
  STAMP_TXT_CURL,
  STAMP_TXT_PATH,
  STAMP_TXT_URL,
  STAMP_URL,
  STAMP_VERIFY_CURL,
} from "./meter-recipe.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const METER_PROSE = [
  METER_EYEBROW,
  METER_HEADLINE,
  METER_LEDE,
  METER_QUESTION,
  METER_SEPARATE,
  METER_RISKS,
  METER_PACKS,
  METER_TICKET,
  METER_MERCHANT_STAMP,
  STAMP_SELLER_EYEBROW,
  STAMP_SELLER_HEADLINE,
  STAMP_SELLER_LEDE,
  STAMP_SELLER_BODY,
  STAMP_SELLER_VERIFY,
  ...STAMP_SELLER_STEPS.map((s) => `${s.t} ${s.d}`),
  METER_CONNECT_BODY,
  METER_DISCOVERY,
  METER_MCP_TOOLS,
  ...METER_STEPS.map((s) => `${s.t} ${s.d}`),
].join(" ");

const BANNED_METER = [
  /watcher/i,
  /unique-amount/i,
  /\bmemo\b/i,
  /\bwired\b/i,
  /\bmagnet\b/i,
  /package scanner/i,
  /pre-sign/i,
  /facilitator/i,
  /\bstub\b/i,
  /canned TAM/i,
  /poll_url/,
  /must_abort/,
  /\bHOLD\b/,
  /Helius/,
  /cheaper/i,
  /Start free trial/,
  /Pay \$29/,
  /They ask before they pay/,
  /\bbroadcast/i,
];

describe("Agent Meter recipe", () => {
  it("locks Can I pay this address / free5 / $0.10 / packs / ticket", () => {
    assert.equal(METER_EYEBROW, "Agent Meter");
    assert.equal(METER_HEADLINE, "Agents pay themselves");
    assert.equal(METER_LEDE, `First 5 free. ${METER_PACKS_FIRST}`);
    assert.match(METER_STEPS[1]?.d ?? "", /Can I pay this address\?/);
    assert.equal(METER_RISKS, "ok | new | warn | sink");
    assert.match(METER_PACKS, /looks_20 \$0\.20/);
    assert.match(METER_PACKS, /addresses_100 \$0\.15/);
    assert.match(METER_PACKS, /stamp_tx \$0\.05/);
    assert.equal(METER_TICKET, "Take this ticket or we do not take your USDC.");
    assert.equal(
      METER_MERCHANT_STAMP,
      "Merchants can require the stamp_tx $0.05 ticket before accepting agent USDC.",
    );
    assert.equal(METER_QUESTION, "Can I pay this address?");
    assert.equal(
      METER_CONNECT_BODY,
      `First 5 free. ${METER_PACKS_FIRST} Agents pay themselves. No inbox. No email. No API key.`,
    );
    assert.equal(
      METER_DISCOVERY,
      "llms.txt → GET /api/v1/meter/pricing → 402 → MCP meter_* tools.",
    );
    assert.equal(METER_MCP_TOOLS, "meter_pricing, meter_scan, meter_buy_pass, meter_watch");
    assert.equal(METER_PRICING_CURL, "curl -s https://agent-control.net/api/v1/meter/pricing");
    assert.equal(METER_PRICING_PATH, "/api/v1/meter/pricing");
    assert.equal(METER_LLMS_HREF, "/llms.txt");
    assert.equal(METER_DOCS_HREF, "/docs#agent-meter");
    assert.match(METER_SEPARATE, /Separate from the Human App/);
    assert.match(METER_SEPARATE, /No inbox/);
    assert.match(METER_SEPARATE, /No email/);
    assert.match(METER_SEPARATE, /no API key/);
    assert.match(METER_SEPARATE, /no Approval Inbox/);
    assert.match(METER_PROSE, /\$0\.10/);
    assert.match(METER_PROSE, /First 5 free/);
    assert.match(METER_PROSE, /looks_20 pack \(\$0\.20\)/);
    assert.match(METER_PROSE, /optional one-shot/);
    assert.match(METER_PROSE, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(METER_PROSE, /No inbox/);
    assert.doesNotMatch(METER_PROSE, /\$0\.25/);
    assert.doesNotMatch(METER_PROSE, /\$0\.02/);
    for (const re of BANNED_METER) {
      assert.doesNotMatch(METER_PROSE, re);
    }
  });

  it("ships llms → pricing → 402 → MCP with look / looks_20", () => {
    assert.match(
      METER_RECIPE,
      /^# 1 discover\n# https:\/\/agent-control\.net\/llms\.txt\ncurl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing$/m,
    );
    assert.match(METER_RECIPE, /First 5 free/);
    assert.match(METER_RECIPE, /looks_20 pack \(\$0\.20\)/);
    assert.match(METER_RECIPE, /402 looks_20 \$0\.20 pack/);
    assert.match(METER_RECIPE, /look \$0\.10 is optional one-shot/);
    assert.match(METER_RECIPE, /looks_20 \$0\.20/);
    assert.match(METER_RECIPE, /addresses_100 \$0\.15/);
    assert.match(METER_RECIPE, /stamp_tx \$0\.05/);
    assert.match(METER_RECIPE, /Take this ticket or we do not take your USDC/);
    assert.match(METER_RECIPE, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(METER_RECIPE, /# 6 MCP meter_\* at \/api\/v1\/mcp/);
    assert.match(METER_RECIPE, /MCP-native \(no Solana key\)/);
    assert.match(METER_RECIPE, /We never take keys/);
    assert.match(METER_RECIPE, /GET \/api\/v1\/meter\/pricing \(paid_sku looks_20, free_looks\)/);
    assert.match(METER_RECIPE, /src\/adapters\/meter-pay-base\.ts/);
    assert.match(METER_RECIPE, /buyMeterPassBase/);
    assert.match(METER_RECIPE, /CDP\/AgentKit/);
    assert.match(METER_RECIPE, /No Solana key needed/);
    assert.equal(
      METER_PAY_SNIPPET,
      `import { buyMeterPassBase } from "./src/adapters/meter-pay-base.ts";
await buyMeterPassBase({ from, signExact });`,
    );
    assert.equal(METER_STEPS[2]?.code, METER_PAY_SNIPPET);
    assert.match(METER_STEPS[2]?.d ?? "", /looks_20/);
    assert.match(METER_STEPS[2]?.d ?? "", /No Phantom/);
    assert.match(METER_STEPS[2]?.d ?? "", /We never take keys/);
    assert.match(METER_STEPS[2]?.d ?? "", /EIP-3009 exact/);
    assert.match(METER_STEPS[2]?.d ?? "", /look \$0\.10 is optional one-shot/);
    assert.doesNotMatch(METER_RECIPE, /\bbroadcast/i);
    assert.doesNotMatch(METER_RECIPE, /^# 4 poll/m);
    assert.match(METER_RECIPE, /^# 4 watch$/m);
    assert.match(
      METER_RECIPE,
      /curl -s -X POST https:\/\/agent-control\.net\/api\/v1\/meter\/watch -H 'content-type: application\/json' -d '\{"invoice_id":"inv_…","payment":\{"x402Version":2,"payload":\{"authorization":\{\},"signature":"<sig>"\},"accepted":\{"network":"base"\}\}\}'/,
    );
    assert.match(METER_RECIPE, /Empty body \{\} = looks_20/);
    assert.match(METER_RECIPE, /\{\\"sku\\":\\"look\\"\} = \$0\.10 one-shot|\{"sku":"look"\} = \$0\.10 one-shot/);
    assert.match(METER_RECIPE, /NOT invoice_id-only for Base/);
    assert.match(METER_RECIPE, /raw\.githubusercontent\.com\/Cobra-bit-prog\/agent-guard\/main\/src\/adapters\/meter-pay-base\.ts/);
    assert.match(METER_STEPS[3]?.d ?? "", /full x402 v2 payment object/);
    assert.match(METER_STEPS[3]?.d ?? "", /not invoice_id-only/);
    assert.match(METER_RECIPE, /X-Agent-Pass: <your-id>/);
    assert.match(METER_RECIPE, /pick any string; first 5 looks on that id are free; then 402 looks_20 \$0\.20 pack \(look \$0\.10 is optional one-shot\)/);
    assert.equal(
      METER_FREE_LOOK_NOTE,
      "pick any string; first 5 looks on that id are free; then 402 looks_20 $0.20 pack (look $0.10 is optional one-shot)",
    );
    assert.match(METER_FREE_LOOK_CURL, /\/api\/v1\/meter\/scan/);
    assert.match(METER_FREE_LOOK_CURL, /X-Agent-Pass: <your-id>/);
    assert.equal(METER_STEPS[1]?.code, METER_FREE_LOOK_CURL);
    assert.match(METER_SCAN_CURL, /\/api\/v1\/meter\/scan/);
    assert.match(METER_SCAN_CURL, /X-Agent-Pass/);
    assert.match(METER_PREFLIGHT_CURL, /\/api\/v1\/meter\/preflight/);
    assert.match(METER_PREFLIGHT_CURL, /X-Agent-Pass/);
    assert.doesNotMatch(METER_RECIPE, /\/meter(?:["'\s]|$)/);
    assert.equal(METER_DOCS_URL, "https://agent-control.net/docs#agent-meter");
  });

  it("puts an Agent Meter door on /connect and leaves the homepage unchanged", () => {
    const connect = read("src/routes/connect.tsx");
    const home = read("src/routes/index.tsx");
    assert.match(connect, /id=["']agent-meter["']/);
    assert.match(connect, /METER_EYEBROW/);
    assert.match(connect, /METER_QUESTION/);
    assert.match(connect, /METER_CONNECT_BODY/);
    assert.match(connect, /METER_DISCOVERY/);
    assert.match(connect, /METER_PRICING_CURL/);
    assert.match(connect, /METER_DOCS_HREF/);
    assert.match(connect, /METER_LLMS_HREF/);
    assert.match(connect, /METER_PRICING_PATH/);
    assert.match(connect, /meter_pricing/);
    assert.match(connect, /meter_scan/);
    assert.match(connect, /meter_buy_pass/);
    assert.doesNotMatch(connect, /\/api\/v1\/meter\/pass/);
    assert.doesNotMatch(connect, /\bbroadcast/i);
    assert.doesNotMatch(connect, /cheaper/i);
    assert.doesNotMatch(home, /Agent Meter/);
    assert.doesNotMatch(home, /METER_/);
    assert.doesNotMatch(home, /First 5 free/);
  });

  it("ships a stamp seller door on /stamp and /connect without restyling the homepage", () => {
    assert.equal(STAMP_PATH, "/stamp");
    assert.equal(STAMP_URL, "https://agent-control.net/stamp");
    assert.equal(STAMP_DOCS_HREF, "/docs#stamp");
    assert.equal(STAMP_SELLER_EYEBROW, "Stamp seller");
    assert.equal(STAMP_SELLER_HEADLINE, "Take this ticket or we do not take your USDC.");
    assert.equal(
      STAMP_SELLER_LEDE,
      "Merchants can require the stamp_tx $0.05 ticket before accepting agent USDC.",
    );
    assert.match(STAMP_SELLER_BODY, /Ask for a stamp first/);
    assert.match(STAMP_SELLER_VERIFY, /meter_verify_stamp/);
    assert.match(STAMP_SELLER_VERIFY, /If verified is true and decision is allow/);
    assert.equal(STAMP_VERIFY_CURL, "curl -s https://agent-control.net/api/v1/meter/stamp/<stamp_id>");
    assert.match(STAMP_SELLER_STEPS[0]?.d ?? "", /Can I pay this address\?/);
    assert.match(STAMP_SELLER_STEPS[0]?.d ?? "", /looks_20 pack \(\$0\.20\)/);
    assert.match(STAMP_SELLER_STEPS[0]?.d ?? "", /stamp_tx \$0\.05/);
    assert.doesNotMatch(STAMP_SELLER_STEPS.map((s) => `${s.t} ${s.d}`).join(" "), /\$0\.25/);
    assert.doesNotMatch(STAMP_SELLER_STEPS.map((s) => `${s.t} ${s.d}`).join(" "), /\$0\.02/);
    assert.doesNotMatch(STAMP_SELLER_STEPS.map((s) => `${s.t} ${s.d}`).join(" "), /cheaper/i);
    assert.doesNotMatch(STAMP_SELLER_STEPS.map((s) => `${s.t} ${s.d}`).join(" "), /\bbroadcast/i);

    const stampPage = read("src/routes/stamp.tsx");
    const connect = read("src/routes/connect.tsx");
    const home = read("src/routes/index.tsx");
    const chrome = read("src/components/marketing/chrome.tsx");
    const sitemap = read("public/sitemap.xml");
    assert.match(stampPage, /createFileRoute\("\/stamp"\)/);
    assert.match(stampPage, /STAMP_SELLER_HEADLINE/);
    assert.match(stampPage, /STAMP_SELLER_LEDE/);
    assert.match(stampPage, /text-body text-muted">\{STAMP_SELLER_LEDE\}/);
    assert.doesNotMatch(stampPage, /text-card text-muted">\{STAMP_SELLER_LEDE\}/);
    assert.match(stampPage, /STAMP_SELLER_STEPS/);
    assert.match(stampPage, /STAMP_VERIFY_CURL/);
    assert.match(stampPage, /STAMP_RECIPE/);
    assert.match(stampPage, /STAMP_TXT_PATH/);
    assert.match(stampPage, /STAMP_TXT_CURL/);
    assert.match(stampPage, /GATE_DEMO_URL/);
    assert.match(stampPage, /GATE_DEMO_BLOCKED_CURL/);
    assert.match(stampPage, /GATE_DEMO_ALLOW_CURL/);
    assert.match(stampPage, /STAMP_ID_HEADER/);
    assert.match(stampPage, /meter_verify_stamp/);
    assert.match(connect, /id=["']stamp["']/);
    assert.match(connect, /STAMP_SELLER_HEADLINE/);
    assert.match(connect, /STAMP_PATH/);
    assert.match(connect, /STAMP_DOCS_HREF/);
    assert.match(connect, /STAMP_TXT_PATH/);
    assert.match(chrome, /href=["']\/stamp["']/);
    assert.match(sitemap, /https:\/\/agent-control\.net\/stamp/);
    assert.doesNotMatch(home, /STAMP_/);
    assert.doesNotMatch(home, /stamp_tx/);
    assert.doesNotMatch(stampPage, /\$0\.25/);
    assert.doesNotMatch(stampPage, /\$0\.02/);
    assert.doesNotMatch(stampPage, /cheaper/i);
    assert.doesNotMatch(stampPage, /\bbroadcast/i);
    assert.doesNotMatch(connect, /cheaper/i);
  });
});

describe("Agent Meter recipe on public discovery surfaces", () => {
  it("llms.txt and /docs share the same curl flow", () => {
    const llms = read("public/llms.txt");
    const docs = read("src/routes/docs.tsx");
    assert.match(llms, /## Agent Meter \(no human on the site\)/);
    assert.match(llms, /Can I pay this address\?/);
    assert.match(llms, /First 5 free/);
    assert.match(llms, /looks_20 pack \(\$0\.20\)/);
    assert.match(llms, /look \$0\.10 is optional one-shot/);
    assert.match(llms, /Base USDC \(EIP-3009 exact\)/);
    assert.match(llms, /Solana USDC/);
    assert.doesNotMatch(llms, /\$0\.02/);
    assert.doesNotMatch(llms, /\$0\.25/);
    assert.match(llms, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(docs, /Merchants can require the stamp_tx \$0\.05 ticket before accepting agent USDC/);
    assert.match(llms, /## Stamp seller/);
    assert.match(llms, /https:\/\/agent-control\.net\/stamp/);
    assert.match(llms, /docs#stamp/);
    assert.match(llms, /If verified is true and decision is allow/);
    assert.match(llms, /curl -s https:\/\/agent-control\.net\/api\/v1\/meter\/stamp\/<stamp_id>/);
    assert.match(llms, /https:\/\/agent-control\.net\/stamp\.txt/);
    assert.match(llms, /curl -s https:\/\/agent-control\.net\/stamp\.txt/);
    assert.match(llms, /\/api\/v1\/gate\/demo/);
    assert.match(llms, /X-Stamp-Id/);
    assert.match(docs, /id=["']stamp["']/);
    assert.match(docs, /href=["']#stamp["']/);
    assert.match(docs, /STAMP_SELLER_HEADLINE/);
    assert.match(docs, /STAMP_VERIFY_CURL/);
    assert.match(docs, /STAMP_RECIPE/);
    assert.match(docs, /STAMP_TXT_PATH/);
    assert.match(docs, /STAMP_PATH/);
    assert.match(llms, /docs#agent-meter/);
    assert.match(llms, /curl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/);
    assert.match(llms, /llms → pricing → 402 → MCP/);
    assert.match(llms, /\/api\/v1\/meter\/watch/);
    assert.match(docs, /id=["']agent-meter["']/);
    assert.match(docs, /METER_RECIPE/);
    assert.match(docs, /METER_PAY_SNIPPET/);
    assert.match(docs, /href=["']#agent-meter["']/);
    assert.match(docs, /No inbox/);
    assert.match(llms, /buyMeterPassBase/);
    assert.match(llms, /src\/adapters\/meter-pay-base\.ts/);
    assert.match(llms, /X-Agent-Pass: <your-id>/);
    assert.match(llms, /MCP-native \(no Solana key\)/);
    assert.match(llms, /We never take keys/);
    assert.match(llms, /free meter_scan → after free-5 meter_buy_pass \(looks_20\) → Base sign_exact → meter_watch\(\{invoice_id, payment\}\) → token/);
    assert.match(llms, /NOT invoice_id-only for Base/);
    assert.match(llms, /full x402 v2 object from payMeterPassBase/);
    assert.match(llms, /sign_exact/);
    assert.match(llms, /adapter_snippet/);
    assert.doesNotMatch(llms, /locked forever/i);
    assert.doesNotMatch(llms, /sacred/i);
    assert.doesNotMatch(llms, /secret_key|private_key|base58_secret/);
    assert.doesNotMatch(llms, /^# 4 poll/m);
    assert.match(llms, /^# 4 watch$/m);
    const lookCurl = llms
      .split("\n")
      .find((line) => line.includes("/api/v1/meter/scan") && line.startsWith("curl"));
    assert.match(lookCurl ?? "", /X-Agent-Pass: <your-id>/);
    for (const line of METER_RECIPE.split("\n")) {
      assert.match(llms, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("ships a curlable stamp.txt merchant recipe next to llms.txt", () => {
    assert.equal(STAMP_TXT_PATH, "/stamp.txt");
    assert.equal(STAMP_TXT_URL, "https://agent-control.net/stamp.txt");
    assert.equal(STAMP_TXT_CURL, "curl -s https://agent-control.net/stamp.txt");
    assert.match(STAMP_BUY_CURL, /"sku":"stamp_tx"/);
    assert.match(STAMP_RECIPE, /# 1 agent buys stamp_tx \$0\.05 via Meter 402/);
    assert.match(STAMP_RECIPE, /# 2 merchant verifies free at https:\/\/agent-control\.net\/stamp/);
    assert.match(STAMP_RECIPE, /GET \/api\/v1\/meter\/stamp\/:id/);
    assert.match(STAMP_RECIPE, /meter_verify_stamp/);
    assert.match(
      STAMP_RECIPE,
      /# 3 merchant only accepts USDC if verified is true and decision is allow/,
    );
    assert.match(STAMP_RECIPE, /Take this ticket or we do not take your USDC/);
    assert.match(STAMP_RECIPE, /First 5 free/);
    assert.match(STAMP_RECIPE, /look \$0\.10 is optional one-shot/);
    assert.match(STAMP_RECIPE, /looks_20 \$0\.20/);
    assert.match(STAMP_RECIPE, /addresses_100 \$0\.15/);
    assert.match(STAMP_RECIPE, /stamp_tx \$0\.05/);
    assert.match(STAMP_RECIPE, /Base USDC \(EIP-3009 exact\)/);
    assert.match(STAMP_RECIPE, /Solana USDC/);
    assert.match(STAMP_RECIPE, /pass_1h catalog-only/);
    assert.match(STAMP_RECIPE, /Separate from the Human App/);
    assert.match(STAMP_RECIPE, /sku: "stamp_tx"/);
    assert.equal(GATE_DEMO_PATH, "/api/v1/gate/demo");
    assert.equal(GATE_DEMO_URL, "https://agent-control.net/api/v1/gate/demo");
    assert.equal(STAMP_ID_HEADER, "X-Stamp-Id");
    assert.equal(GATE_DEMO_BLOCKED_CURL, "curl -s -D - https://agent-control.net/api/v1/gate/demo");
    assert.match(GATE_DEMO_ALLOW_CURL, /X-Stamp-Id: <stamp_id>/);
    assert.match(STAMP_RECIPE, /GET or POST \/api\/v1\/gate\/demo/);
    assert.match(STAMP_RECIPE, /src\/adapters\/stamp-gate\.ts/);
    assert.match(STAMP_SELLER_STEPS[3]?.d ?? "", /\/api\/v1\/gate\/demo/);
    assert.doesNotMatch(STAMP_RECIPE, /\$0\.02/);
    assert.doesNotMatch(STAMP_RECIPE, /\$0\.25/);
    assert.doesNotMatch(STAMP_RECIPE, /cheaper/i);
    assert.doesNotMatch(STAMP_RECIPE, /\bHelius\b/);
    assert.doesNotMatch(STAMP_RECIPE, /\bbroadcast/i);

    const stampTxt = read("public/stamp.txt");
    assert.equal(stampTxt.trimEnd(), STAMP_RECIPE.trimEnd());
    assert.match(stampTxt, /curl -s -X POST https:\/\/agent-control\.net\/api\/v1\/meter\/pass/);
    assert.match(stampTxt, /curl -s https:\/\/agent-control\.net\/api\/v1\/meter\/stamp\/<stamp_id>/);

    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const vercel = read("vercel.json");
    const agents = read("public/agents.txt");
    const agentsJson = read("public/agents.json");
    assert.match(robots, /Allow: \/stamp\.txt/);
    assert.match(sitemap, /<loc>https:\/\/agent-control\.net\/stamp\.txt<\/loc>/);
    assert.match(vercel, /"source": "\/stamp\.txt"/);
    assert.match(vercel, /text\/plain; charset=utf-8/);
    assert.match(agents, /https:\/\/agent-control\.net\/stamp\.txt/);
    assert.match(agentsJson, /https:\/\/agent-control\.net\/stamp\.txt/);
  });
});
