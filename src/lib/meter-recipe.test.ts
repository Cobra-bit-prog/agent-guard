import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METER_DOCS_URL,
  METER_EYEBROW,
  METER_HEADLINE,
  METER_LEDE,
  METER_PAY_SNIPPET,
  METER_PREFLIGHT_CURL,
  METER_RECIPE,
  METER_SCAN_CURL,
  METER_SEPARATE,
  METER_STEPS,
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
  ...METER_STEPS.map((s) => `${s.t} ${s.d}`),
].join(" ");

describe("Agent Meter recipe", () => {
  it("locks agents-pay-themselves copy and the $0.25 scan + preflight pass", () => {
    assert.equal(METER_EYEBROW, "Agent Meter");
    assert.equal(METER_HEADLINE, "Agents pay themselves");
    assert.equal(METER_LEDE, "A $0.25 pass. Then scan and preflight. No inbox.");
    assert.match(METER_SEPARATE, /Separate from the Human App/);
    assert.match(METER_SEPARATE, /No email/);
    assert.match(METER_SEPARATE, /no API key/);
    assert.match(METER_SEPARATE, /no Approval Inbox/);
    assert.match(METER_PROSE, /\$0\.25/);
    assert.match(METER_PROSE, /scan and preflight/i);
    assert.match(METER_PROSE, /No inbox/);
    assert.doesNotMatch(METER_PROSE, /poll_url/);
    assert.doesNotMatch(METER_PROSE, /must_abort/);
    assert.doesNotMatch(METER_PROSE, /\bHOLD\b/);
    assert.doesNotMatch(METER_PROSE, /Helius/);
    assert.doesNotMatch(METER_PROSE, /cheaper/i);
    assert.doesNotMatch(METER_PROSE, /Start free trial/);
    assert.doesNotMatch(METER_PROSE, /Pay \$29/);
    assert.doesNotMatch(METER_PROSE, /They ask before they pay/);
    assert.doesNotMatch(METER_PROSE, /\bbroadcast/i);
  });

  it("ships the exact curl recipe with watch, scan, and preflight", () => {
    assert.match(
      METER_RECIPE,
      /^# 1 discover\ncurl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing$/m,
    );
    assert.match(
      METER_RECIPE,
      /curl -s -X POST https:\/\/agent-control\.net\/api\/v1\/meter\/pass -H 'content-type: application\/json' -d '\{\}'/,
    );
    assert.match(
      METER_RECIPE,
      /# 3 pay 0\.25 USDC on Solana to pay_to WITH reference from the 402/,
    );
    assert.match(METER_RECIPE, /src\/adapters\/meter-pay\.ts/);
    assert.match(METER_RECIPE, /buyMeterPass/);
    assert.equal(
      METER_PAY_SNIPPET,
      `import { buyMeterPass } from "./src/adapters/meter-pay.ts";
await buyMeterPass({ keypair });`,
    );
    assert.equal(METER_STEPS[2]?.code, METER_PAY_SNIPPET);
    assert.match(METER_STEPS[2]?.d ?? "", /src\/adapters\/meter-pay\.ts/);
    assert.match(METER_STEPS[2]?.d ?? "", /No Phantom/);
    assert.doesNotMatch(METER_RECIPE, /\bbroadcast/i);
    assert.match(METER_RECIPE, /# 4 poll/);
    assert.match(
      METER_RECIPE,
      /curl -s -X POST https:\/\/agent-control\.net\/api\/v1\/meter\/watch -H 'content-type: application\/json' -d '\{"invoice_id":"inv_…"\}'/,
    );
    assert.match(METER_RECIPE, /# 5 use scan \+ preflight with X-Agent-Pass/);
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
    assert.match(llms, /Agents pay themselves/);
    assert.match(llms, /docs#agent-meter/);
    assert.match(llms, /curl -s https:\/\/agent-control\.net\/api\/v1\/meter\/pricing/);
    assert.match(llms, /\/api\/v1\/meter\/pass/);
    assert.match(llms, /\/api\/v1\/meter\/watch/);
    assert.match(docs, /id=["']agent-meter["']/);
    assert.match(docs, /METER_RECIPE/);
    assert.match(docs, /METER_PAY_SNIPPET/);
    assert.match(docs, /href=["']#agent-meter["']/);
    assert.match(llms, /buyMeterPass/);
    assert.match(llms, /src\/adapters\/meter-pay\.ts/);
    for (const line of METER_RECIPE.split("\n")) {
      assert.match(llms, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
