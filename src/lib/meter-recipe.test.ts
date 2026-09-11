import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METER_DOCS_URL,
  METER_EYEBROW,
  METER_FREE_LOOK_CURL,
  METER_FREE_LOOK_NOTE,
  METER_HEADLINE,
  METER_LEDE,
  METER_PACKS,
  METER_PAY_SNIPPET,
  METER_PREFLIGHT_CURL,
  METER_RECIPE,
  METER_RISKS,
  METER_SCAN_CURL,
  METER_SEPARATE,
  METER_STEPS,
  METER_TICKET,
} from "./meter-recipe.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const METER_PROSE = [
  METER_EYEBROW,
  METER_HEADLINE,
  METER_LEDE,
  METER_SEPARATE,
  METER_RISKS,
  METER_PACKS,
  METER_TICKET,
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
  it("locks Can I pay this address / free5 / $0.02 / packs / ticket", () => {
    assert.equal(METER_EYEBROW, "Agent Meter");
    assert.equal(METER_HEADLINE, "Agents pay themselves");
    assert.equal(METER_LEDE, "First 5 free. Then $0.02 USDC.");
    assert.match(METER_STEPS[1]?.d ?? "", /Can I pay this address\?/);
    assert.equal(METER_RISKS, "ok | new | warn | sink");
    assert.match(METER_PACKS, /looks_20 \$0\.20/);
    assert.match(METER_PACKS, /addresses_100 \$0\.15/);
    assert.match(METER_PACKS, /stamp_tx \$0\.05/);
    assert.equal(METER_TICKET, "Take this ticket or we do not take your USDC.");
    assert.match(METER_SEPARATE, /Separate from the Human App/);
    assert.match(METER_SEPARATE, /No email/);
    assert.match(METER_SEPARATE, /no API key/);
    assert.match(METER_SEPARATE, /no Approval Inbox/);
    assert.match(METER_PROSE, /\$0\.02/);
    assert.match(METER_PROSE, /First 5 free/);
    assert.doesNotMatch(METER_PROSE, /\$0\.25/);
    for (const re of BANNED_METER) {
      assert.doesNotMatch(METER_PROSE, re);
    }
  });

  it("ships llms → pricing → 402 → MCP with look / looks_20", () => {
    assert.match(
      METER_RECIPE,
      /^# 1 discover\n# https:\/\/agent-control\.net\/llms\.txt\ncurl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing$/m,
    );
    assert.match(METER_RECIPE, /First 5 free\. Then \$0\.02 USDC/);
    assert.match(METER_RECIPE, /402 look \$0\.02/);
    assert.match(METER_RECIPE, /looks_20 \$0\.20/);
    assert.match(METER_RECIPE, /addresses_100 \$0\.15/);
    assert.match(METER_RECIPE, /stamp_tx \$0\.05/);
    assert.match(METER_RECIPE, /Take this ticket or we do not take your USDC/);
    assert.match(METER_RECIPE, /# 6 MCP meter_\* at \/api\/v1\/mcp/);
    assert.match(METER_RECIPE, /src\/adapters\/meter-pay\.ts/);
    assert.match(METER_RECIPE, /buyMeterPass/);
    assert.equal(
      METER_PAY_SNIPPET,
      `import { buyMeterPass } from "./src/adapters/meter-pay.ts";
await buyMeterPass({ keypair });`,
    );
    assert.equal(METER_STEPS[2]?.code, METER_PAY_SNIPPET);
    assert.match(METER_STEPS[2]?.d ?? "", /looks_20/);
    assert.match(METER_STEPS[2]?.d ?? "", /No Phantom/);
    assert.doesNotMatch(METER_RECIPE, /\bbroadcast/i);
    assert.doesNotMatch(METER_RECIPE, /^# 4 poll/m);
    assert.match(METER_RECIPE, /^# 4 watch$/m);
    assert.match(
      METER_RECIPE,
      /curl -s -X POST https:\/\/agent-control\.net\/api\/v1\/meter\/watch -H 'content-type: application\/json' -d '\{"invoice_id":"inv_…"\}'/,
    );
    assert.match(METER_RECIPE, /X-Agent-Pass: <your-id>/);
    assert.match(METER_RECIPE, /pick any string; first 5 looks on that id are free; then 402 look \$0\.02/);
    assert.equal(METER_FREE_LOOK_NOTE, "pick any string; first 5 looks on that id are free; then 402 look $0.02");
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
});

describe("Agent Meter recipe on public discovery surfaces", () => {
  it("llms.txt and /docs share the same curl flow", () => {
    const llms = read("public/llms.txt");
    const docs = read("src/routes/docs.tsx");
    assert.match(llms, /## Agent Meter \(no human on the site\)/);
    assert.match(llms, /Can I pay this address\?/);
    assert.match(llms, /First 5 free\. Then \$0\.02 USDC/);
    assert.match(llms, /docs#agent-meter/);
    assert.match(llms, /curl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/);
    assert.match(llms, /llms → pricing → 402 → MCP/);
    assert.match(llms, /\/api\/v1\/meter\/watch/);
    assert.match(docs, /id=["']agent-meter["']/);
    assert.match(docs, /METER_RECIPE/);
    assert.match(docs, /METER_PAY_SNIPPET/);
    assert.match(docs, /href=["']#agent-meter["']/);
    assert.match(llms, /buyMeterPass/);
    assert.match(llms, /src\/adapters\/meter-pay\.ts/);
    assert.match(llms, /X-Agent-Pass: <your-id>/);
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
});
